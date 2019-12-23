import * as d3 from 'd3'
import _ from 'lodash'
import { HeatmapRange, HeatmapData, DataTag, tagUnit } from '.'
import { createBuffer } from './buffer'
import { labelAxisGroup } from './axis/label-axis'
import { histogram } from './axis/histogram'
import { getColorTheme, ColorTheme } from './color'
import { truncateString, clickToCopyBehavior } from './utils'

const margin = {
  top: 25,
  right: 40,
  bottom: 70,
  left: 90
}

const tooltipSize = {
  width: 270,
  height: 190
}

const tooltipOffset = {
  horizontal: 20,
  vertical: 20
}

type TooltipStatus = {
  pinned: boolean
  hidden: boolean
  x: number
  y: number
}

type FocusStatus = {
  xDomain: [number, number]
  yDomain: [number, number]
}

const defaultTooltipStatus = { pinned: false, hidden: true, x: 0, y: 0 }

export function heatmapChart(container, onBrush: (range: HeatmapRange) => void, onZoom: () => void) {
  let data: HeatmapData
  let maxValue = 0
  let brightness = 1
  let colorTheme: ColorTheme
  let bufferCanvas: HTMLCanvasElement
  let zoomTransform = d3.zoomIdentity
  let tooltipStatus: TooltipStatus = defaultTooltipStatus
  let focusStatus: FocusStatus | null = null
  let isBrushing = false
  let width = 0
  let height = 0
  let canvasWidth = 0
  let canvasHeight = 0
  let dataTag: DataTag = 'written_bytes'
  const MSAARatio = 4

  function updateBuffer() {
    maxValue = d3.max(data.data[dataTag].map(array => d3.max(array)!)) || 0
    colorTheme = getColorTheme(maxValue, brightness)
    bufferCanvas = createBuffer(data.data[dataTag], colorTheme.backgroud)
  }

  heatmapChart.data = function(val: HeatmapData) {
    data = val
    updateBuffer()
    tooltipStatus = defaultTooltipStatus
    heatmapChart()
  }

  heatmapChart.dataTag = function(val: DataTag) {
    dataTag = val
    updateBuffer()
    tooltipStatus = defaultTooltipStatus
    heatmapChart()
  }

  heatmapChart.brightness = function(val: number) {
    brightness = val
    updateBuffer()
    heatmapChart()
  }

  heatmapChart.brush = function(enabled: boolean) {
    isBrushing = enabled
    heatmapChart()
  }

  heatmapChart.resetZoom = function() {
    zoomTransform = d3.zoomIdentity
    heatmapChart()
  }

  heatmapChart.size = function(newWidth, newHeight) {
    const newCanvasWidth = newWidth - margin.left - margin.right
    const newCanvasHeight = newHeight - margin.top - margin.bottom
    // Sync transform on resize
    if (canvasWidth !== 0 && canvasHeight !== 0) {
      zoomTransform = d3.zoomIdentity
        .translate((zoomTransform.x * newCanvasWidth) / canvasWidth, (zoomTransform.y * newCanvasHeight) / canvasHeight)
        .scale(zoomTransform.k)
    }
    width = newWidth
    height = newHeight
    canvasWidth = newCanvasWidth
    canvasHeight = newCanvasHeight

    heatmapChart()
  }

  function heatmapChart() {
    let xHistogramCanvas = container.selectAll('canvas.x-histogram').data([null])
    xHistogramCanvas = xHistogramCanvas
      .enter()
      .append('canvas')
      .classed('x-histogram', true)
      .style('position', 'absolute')
      .style('z-index', '100')
      .merge(xHistogramCanvas)
      .attr('width', canvasWidth)
      .attr('height', 30)
      .style('margin-top', height - 60 + 'px')
      .style('margin-left', margin.left + 'px')

    let yHistogramCanvas = container.selectAll('canvas.y-histogram').data([null])
    yHistogramCanvas = yHistogramCanvas
      .enter()
      .append('canvas')
      .classed('y-histogram', true)
      .style('position', 'absolute')
      .style('z-index', '101')
      .merge(yHistogramCanvas)
      .attr('width', 30)
      .attr('height', canvasHeight)
      .style('margin-top', margin.top + 'px')
      .style('margin-left', width - 30 + 'px')

    let labelCanvas = container.selectAll('canvas.label').data([null])
    labelCanvas = labelCanvas
      .enter()
      .append('canvas')
      .classed('label', true)
      .style('position', 'absolute')
      .style('z-index', '102')
      .merge(labelCanvas)
      .attr('width', 60)
      .attr('height', canvasHeight)
      .style('margin-top', margin.top + 'px')
      .style('margin-left', 20 + 'px')

    let canvas = container.selectAll('canvas.heatmap').data([null])
    canvas = canvas
      .enter()
      .append('canvas')
      .classed('heatmap', true)
      .style('position', 'absolute')
      .style('z-index', '103')
      .merge(canvas)
      .attr('width', canvasWidth * MSAARatio)
      .attr('height', canvasHeight * MSAARatio)
      .style('width', canvasWidth + 'px')
      .style('height', canvasHeight + 'px')
      .style('margin-top', margin.top + 'px')
      .style('margin-right', margin.right + 'px')
      .style('margin-bottom', margin.bottom + 'px')
      .style('margin-left', margin.left + 'px')

    let axis = container.selectAll('svg').data([null])
    axis = axis
      .enter()
      .append('svg')
      .style('position', 'absolute')
      .style('z-index', '200')
      .merge(axis)
      .style('width', width + 'px')
      .style('height', height + 'px')

    let tooltipLayer = container.selectAll('div').data([null])
    tooltipLayer = tooltipLayer
      .enter()
      .append('div')
      .style('position', 'absolute')
      .style('z-index', '300')
      .style('pointer-events', 'none')
      .merge(tooltipLayer)
      .style('width', width + 'px')
      .style('height', height + 'px')

    const ctx: CanvasRenderingContext2D = canvas.node().getContext('2d')
    ctx.imageSmoothingEnabled = false

    const xScale = d3
      .scaleLinear()
      .domain([0, data.timeAxis.length - 2])
      .range([0, canvasWidth])

    const yScale = d3
      .scaleLinear()
      .domain([0, data.keyAxis.length - 2])
      .range([0, canvasHeight])

    const xAxis = d3
      .axisBottom(xScale)
      .tickFormat(idx =>
        data.timeAxis[idx as number] !== undefined
          ? d3.timeFormat('%Y-%m-%d %H:%M:%S')(new Date(data.timeAxis[idx as number]))
          : ''
      )
      .ticks(width / 270)

    const labelAxis = labelAxisGroup(data.keyAxis).range([0, canvasHeight])

    const histogramAxis = histogram(data.data[dataTag])
      .xRange([0, canvasWidth])
      .yRange([0, canvasHeight])

    let xAxisG = axis.selectAll('g.x-axis').data([null])
    xAxisG = xAxisG
      .enter()
      .append('g')
      .classed('x-axis', true)
      .merge(xAxisG)
      .attr('transform', 'translate(' + margin.left + ',' + (height - 20) + ')')

    d3.zoom().transform(axis, zoomTransform)

    const zoomBehavior = d3
      .zoom()
      .scaleExtent([1, 128])
      .on('zoom', zoomed)
      .on('end', zoomEnd)

    function constrainBoucing(transform) {
      const bounceRatio = 0.8
      const dragLeft = Math.max(0, transform.applyX(0))
      const dragRight = Math.max(0, canvasWidth - transform.applyX(canvasWidth))
      const dragTop = Math.max(0, transform.applyY(0))
      const dragBottom = Math.max(0, canvasHeight - transform.applyY(canvasHeight))
      return d3.zoomIdentity
        .translate(
          Math.floor(transform.x - (dragLeft - dragRight) * bounceRatio),
          Math.floor(transform.y - (dragTop - dragBottom) * bounceRatio)
        )
        .scale(transform.k)
    }

    function constrainHard(transform) {
      let dx0 = transform.invertX(0),
        dx1 = transform.invertX(canvasWidth) - canvasWidth,
        dy0 = transform.invertY(0),
        dy1 = transform.invertY(canvasHeight) - canvasHeight
      return transform.translate(
        dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1),
        dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1)
      )
    }

    function zoomed() {
      onZoom()
      if (d3.event.sourceEvent && d3.event.sourceEvent.type === 'mousemove') {
        zoomTransform = constrainBoucing(d3.event.transform)
        hideTooltips()
      } else {
        zoomTransform = constrainHard(d3.event.transform)
        showTooltips()
      }
      render()
    }

    function zoomEnd() {
      zoomTransform = constrainHard(zoomTransform)
      axis.call(d3.zoom().transform, zoomTransform)
      if (tooltipStatus.pinned) {
        showTooltips()
      }
      render()
    }

    function focusPoint(x: number, y: number) {
      focusStatus = { xDomain: [x, x + 0.001], yDomain: [y, y + 0.001] }
    }

    function hoverBehavior(axis) {
      axis.on('mousemove', () => {
        showTooltips()
        render()
      })

      axis.on('mouseout', () => {
        if (!tooltipStatus.pinned) focusStatus = null
        render()
      })
    }

    function showTooltips() {
      tooltipStatus.hidden = false

      if (!tooltipStatus.pinned) {
        const mouseCanvasOffset = d3.mouse(canvas.node())
        if (isNaN(mouseCanvasOffset[0])) return

        const xRescale = zoomTransform.rescaleX(xScale)
        const yRescale = zoomTransform.rescaleY(yScale)
        const x = xRescale.invert(mouseCanvasOffset[0])
        const y = yRescale.invert(mouseCanvasOffset[1])

        focusPoint(x, y)

        if (
          mouseCanvasOffset[0] < 0 ||
          mouseCanvasOffset[0] > canvasWidth ||
          mouseCanvasOffset[1] < 0 ||
          mouseCanvasOffset[1] > canvasHeight
        ) {
          hideTooltips()
        } else {
          tooltipStatus.x = x
          tooltipStatus.y = y
        }
      }
    }

    function hideTooltips() {
      tooltipStatus.hidden = true
    }

    function hideAxisTicksWithoutLabel() {
      axis.selectAll('.tick text').each(function() {
        if (this.innerHTML === '') {
          this.parentNode.style.display = 'none'
        }
      })
    }

    axis.on('click', clicked)

    function clicked() {
      if (d3.event.defaultPrevented) return // zoom

      const mouseCanvasOffset = d3.mouse(canvas.node())
      if (
        mouseCanvasOffset[0] < 0 ||
        mouseCanvasOffset[0] > canvasWidth ||
        mouseCanvasOffset[1] < 0 ||
        mouseCanvasOffset[1] > canvasHeight
      ) {
        return
      }

      tooltipStatus.pinned = !tooltipStatus.pinned
      showTooltips()
      render()
    }

    axis.call(zoomBehavior)
    axis.call(hoverBehavior)

    function render() {
      renderHeatmap()
      renderHighlight()
      rednerAxis()
      renderBrush()
      renderTooltip()
      renderCross()
    }

    function renderHeatmap() {
      ctx.clearRect(0, 0, canvasWidth * MSAARatio, canvasHeight * MSAARatio)
      ctx.drawImage(
        bufferCanvas,
        xScale.invert(zoomTransform.invertX(0)),
        yScale.invert(zoomTransform.invertY(0)),
        xScale.invert(canvasWidth * (1 / zoomTransform.k)),
        yScale.invert(canvasHeight * (1 / zoomTransform.k)),
        0,
        0,
        canvasWidth * MSAARatio,
        canvasHeight * MSAARatio
      )
    }

    function renderHighlight() {
      const selectedData = data.data[dataTag]
      const xLen = selectedData.length
      const yLen = selectedData[0].length
      const xRescale = zoomTransform.rescaleX(xScale)
      const yRescale = zoomTransform.rescaleY(yScale)
      const xStartIdx = Math.max(0, Math.floor(xScale.invert(0)))
      const xEndIdx = Math.min(xLen - 1, Math.ceil(xScale.invert(canvasWidth)))
      const yStartIdx = Math.max(0, Math.floor(yScale.invert(0)))
      const yEndIdx = Math.min(yLen - 1, Math.ceil(yScale.invert(canvasHeight)))

      ctx.shadowColor = '#ffff'
      ctx.shadowBlur = (15 + 2 * (zoomTransform.k - 1)) * MSAARatio
      ctx.fillStyle = 'blue'
      for (let x = xStartIdx; x < xEndIdx; x++) {
        for (let y = yStartIdx; y < yEndIdx; y++) {
          if (selectedData[x][y] > maxValue / 3) {
            const left = xRescale(x)
            const top = yRescale(y)
            const right = xRescale(x + 1)
            const bottom = yRescale(y + 1)
            const width = right - left
            const height = bottom - top
            const xPadding = ((2 + 2 * (1 - 1 / zoomTransform.k)) * width) / height
            const yPadding = ((2 + 2 * (1 - 1 / zoomTransform.k)) * height) / width
            ctx.beginPath()
            ctx.shadowOffsetX = (left + 1000) * MSAARatio
            ctx.shadowOffsetY = (top + 1000) * MSAARatio
            ctx.fillRect(
              (-1000 - xPadding) * MSAARatio,
              (-1000 - yPadding) * MSAARatio,
              (right - left + xPadding * 2) * MSAARatio,
              (bottom - top + yPadding * 2) * MSAARatio
            )
            ctx.closePath()
          }
        }
      }
    }

    function rednerAxis() {
      const xRescale = zoomTransform.rescaleX(xScale)
      const yRescale = zoomTransform.rescaleY(yScale)
      histogramAxis(
        xHistogramCanvas.node().getContext('2d'),
        yHistogramCanvas.node().getContext('2d'),
        focusStatus?.xDomain,
        focusStatus?.yDomain,
        xRescale,
        yRescale
      )
      labelAxis(labelCanvas.node().getContext('2d'), focusStatus?.yDomain, yRescale)
      xAxisG.call(xAxis.scale(xRescale))
      hideAxisTicksWithoutLabel()
    }

    function renderBrush() {
      if (isBrushing) {
        const brush = d3
          .brush()
          .extent([
            [0, 0],
            [canvasWidth, canvasHeight]
          ])
          .on('start', brushStart)
          .on('end', brushEnd)

        let brushSvg = axis.selectAll('g.brush').data([null])
        brushSvg = brushSvg
          .enter()
          .append('g')
          .classed('brush', true)
          .merge(brushSvg)
          .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
          .call(brush)

        function brushStart() {
          hideTooltips()
          render()
        }

        function brushEnd() {
          brushSvg.remove()
          isBrushing = false

          const selection = d3.event.selection
          if (selection) {
            brush.move(brushSvg, null)
            const domainTopLeft = zoomTransform.invert(selection[0])
            const domainBottomRight = zoomTransform.invert(selection[1])
            const startTime = data.timeAxis[Math.round(xScale.invert(domainTopLeft[0]))]
            const endTime = data.timeAxis[Math.round(xScale.invert(domainBottomRight[0]))]
            const startKey = data.keyAxis[Math.round(yScale.invert(domainTopLeft[1]))].key
            const endKey = data.keyAxis[Math.round(yScale.invert(domainBottomRight[1]))].key

            onBrush({
              startTime: startTime,
              endTime: endTime,
              startKey: startKey,
              endKey: endKey
            })
          }

          showTooltips()
          render()
        }
      } else {
        axis.selectAll('g.brush').remove()
      }
    }

    function renderTooltip() {
      if (tooltipStatus.hidden) {
        tooltipLayer.selectAll('div').remove()
      } else {
        const xRescale = zoomTransform.rescaleX(xScale)
        const yRescale = zoomTransform.rescaleY(yScale)
        const canvasOffset = [xRescale(tooltipStatus.x), yRescale(tooltipStatus.y)]
        const clampX = x => _.clamp(x, 0, canvasWidth - tooltipSize.width)
        const clampY = y => _.clamp(y, 0, canvasHeight - tooltipSize.height)
        const rightX = margin.left + clampX(canvasOffset[0] + tooltipOffset.horizontal)
        const leftX = margin.left + clampX(canvasOffset[0] + -tooltipSize.width - tooltipOffset.horizontal)
        const bottomY = margin.top + clampY(canvasOffset[1] + tooltipOffset.vertical)
        const topY = margin.top + clampY(canvasOffset[1] - tooltipSize.height - tooltipOffset.vertical)
        const tooltipX = canvasOffset[0] < canvasWidth / 2 ? rightX : leftX
        const tooltipY = canvasOffset[1] < canvasHeight / 2 ? bottomY : topY

        let tooltipDiv = tooltipLayer.selectAll('div').data([null])
        tooltipDiv = tooltipDiv
          .enter()
          .append('div')
          .style('position', 'absolute')
          .style('width', tooltipSize.width + 'px')
          .style('height', tooltipSize.height + 'px')
          .classed('tooltip', true)
          .merge(tooltipDiv)
          .style('pointer-events', tooltipStatus.pinned ? 'all' : 'none')
          .style('left', tooltipX + 'px')
          .style('top', tooltipY + 'px')

        const timeIdx = Math.floor(tooltipStatus.x)
        const keyIdx = Math.floor(tooltipStatus.y)
        const value = data.data[dataTag][timeIdx][keyIdx]

        let valueDiv = tooltipDiv.selectAll('div.value').data([null])
        valueDiv = valueDiv
          .enter()
          .append('div')
          .classed('value', true)
          .merge(valueDiv)

        let valueText = valueDiv.selectAll('p.value').data([null])
        valueText = valueText
          .enter()
          .append('p')
          .classed('value', true)
          .merge(valueText)
          .text(value)
          .style('color', colorTheme.label(value))
          .style('background-color', colorTheme.backgroud(value))

        let unitText = valueDiv.selectAll('p.unit').data([null])
        unitText = unitText
          .enter()
          .append('p')
          .classed('unit', true)
          .merge(unitText)
          .text(tagUnit(dataTag))

        let timeDiv = tooltipDiv.selectAll('div.time').data([null])
        timeDiv = timeDiv
          .enter()
          .append('div')
          .classed('time', true)
          .merge(timeDiv)

        let timeText = timeDiv.selectAll('button.time').data([timeIdx, timeIdx + 1])
        let timeTextEnter = timeText.enter()
        // timeTextEnter
        //   .append('p')
        //   .text('-')
        //   .style('display', (d, i) => (i > 0 ? '' : 'none'))
        timeText = timeTextEnter
          .append('button')
          .classed('time', true)
          .merge(timeTextEnter)
          .call(clickToCopyBehavior, d => d3.timeFormat('%Y-%m-%d %H:%M:%S')(new Date(data.timeAxis[d])))
          .text(d => d3.timeFormat('%Y-%m-%d %H:%M:%S')(new Date(data.timeAxis[d])))

        let keyDiv = tooltipDiv.selectAll('div.key').data([keyIdx, keyIdx + 1])
        keyDiv = keyDiv
          .enter()
          .append('div')
          .classed('key', true)
          .merge(keyDiv)

        let labelText = keyDiv.selectAll('button.label').data(d => [d])
        labelText = labelText
          .enter()
          .append('button')
          .classed('label', true)
          .merge(labelText)
          .call(clickToCopyBehavior, d => data.keyAxis[d]!.labels.join('/'))
          .text(d => data.keyAxis[d]!.labels.join('/'))

        let keyText = keyDiv.selectAll('button.key').data(d => [d])
        keyText = keyText
          .enter()
          .append('button')
          .classed('key', true)
          .merge(keyText)
          .call(clickToCopyBehavior, d => data.keyAxis[d]!.key)
          .text(d => truncateString(data.keyAxis[d]!.key, 30))
      }
    }

    function renderCross() {
      if (tooltipStatus.pinned) {
        const xRescale = zoomTransform.rescaleX(xScale)
        const yRescale = zoomTransform.rescaleY(yScale)
        const canvasOffset = [xRescale(tooltipStatus.x) * MSAARatio, yRescale(tooltipStatus.y) * MSAARatio]
        const crossCenterPadding = 3 * MSAARatio
        const crossBorder = 1 * MSAARatio
        const crossSize = 8 * MSAARatio
        const crossWidth = 2 * MSAARatio

        ctx.lineWidth = crossWidth + 2 * crossBorder
        ctx.strokeStyle = '#111'
        ctx.beginPath()
        ctx.moveTo(canvasOffset[0], canvasOffset[1] - crossSize - crossBorder)
        ctx.lineTo(canvasOffset[0], canvasOffset[1] - crossCenterPadding + crossBorder)
        ctx.moveTo(canvasOffset[0], canvasOffset[1] + crossCenterPadding - crossBorder)
        ctx.lineTo(canvasOffset[0], canvasOffset[1] + crossSize + crossBorder)
        ctx.moveTo(canvasOffset[0] - crossSize - crossBorder, canvasOffset[1])
        ctx.lineTo(canvasOffset[0] - crossCenterPadding + crossBorder, canvasOffset[1])
        ctx.moveTo(canvasOffset[0] + crossCenterPadding - crossBorder, canvasOffset[1])
        ctx.lineTo(canvasOffset[0] + crossSize + crossBorder, canvasOffset[1])
        ctx.stroke()
        ctx.lineWidth = crossWidth
        ctx.strokeStyle = '#eee'
        ctx.beginPath()
        ctx.moveTo(canvasOffset[0], canvasOffset[1] - crossSize)
        ctx.lineTo(canvasOffset[0], canvasOffset[1] - crossCenterPadding)
        ctx.moveTo(canvasOffset[0], canvasOffset[1] + crossCenterPadding)
        ctx.lineTo(canvasOffset[0], canvasOffset[1] + crossSize)
        ctx.moveTo(canvasOffset[0] - crossSize, canvasOffset[1])
        ctx.lineTo(canvasOffset[0] - crossCenterPadding, canvasOffset[1])
        ctx.moveTo(canvasOffset[0] + crossCenterPadding, canvasOffset[1])
        ctx.lineTo(canvasOffset[0] + crossSize, canvasOffset[1])
        ctx.stroke()
      }
    }

    render()
  }

  return heatmapChart
}
