import * as d3 from 'd3'
import { Section, DisplaySection, scaleSections } from '.'
import { KeyAxisEntry } from '..'
import { truncateString } from '../utils'
import _ from 'lodash'

const labelAxisMargin = 4
const labelAxisWidth = 28
const labelTextPadding = 4
const minTextHeight = 17
const fill = '#333'
const fillFocus = '#ccc'
const stroke = '#fff'
const textFill = 'white'
const textFillFocus = '#333'
const font = '500 12px Poppins'
const focusFont = '700 12px Poppins'

type Label = Section<string>
type DisplayLabel = DisplaySection<string>

export function labelAxisGroup(keyAxis: KeyAxisEntry[]) {
  let range: [number, number] = [0, 0]
  const groups = aggrKeyAxisLabel(keyAxis)

  labelAxisGroup.range = function(val) {
    range = val
    return this
  }

  function labelAxisGroup(
    ctx: CanvasRenderingContext2D,
    focusDomain: [number, number] | null,
    scale: (idx: number) => number
  ) {
    const width = ctx.canvas.width
    const height = ctx.canvas.height

    let scaledGroups = groups.map(group => scaleSections(group, focusDomain, range, scale, () => ''))

    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    ctx.textBaseline = 'middle'
    for (const [groupIdx, group] of scaledGroups.entries()) {
      const marginLeft = groupIdx * (labelAxisWidth + labelAxisMargin)

      for (const label of group) {
        const width = labelAxisWidth
        const height = label.endPos - label.startPos

        ctx.fillStyle = label.focus ? fillFocus : fill
        ctx.beginPath()
        ctx.rect(marginLeft, label.startPos, width, height)
        ctx.fill()
        ctx.stroke()
        ctx.closePath()

        if (shouleShowLabelText(label)) {
          ctx.font = label.focus ? focusFont : font
          ctx.fillStyle = label.focus ? textFillFocus : textFill
          ctx.translate(marginLeft + labelAxisWidth / 2 + 2, label.endPos - labelTextPadding)
          ctx.rotate(-Math.PI / 2)
          ctx.fillText(fitLabelText(label), 0, 0)
          ctx.setTransform(1, 0, 0, 1, 0, 0)
        }
      }
    }
  }

  return labelAxisGroup
}

function shouleShowLabelText(label: DisplayLabel): boolean {
  return label.endPos - label.startPos >= minTextHeight && label.val?.length !== 0
}

function fitLabelText(label: DisplayLabel): string {
  const rectWidth = label.endPos - label.startPos
  const textLen = Math.floor(rectWidth / 7.5)
  return truncateString(label.val, textLen)
}

function aggrKeyAxisLabel(keyAxis: KeyAxisEntry[]): Label[][] {
  let result: Label[][] = _.times(4, () => [])

  for (let groupIdx = 0; groupIdx < result.length; groupIdx++) {
    let lastLabel: string | null = null
    let startKeyIdx: number | null = null

    for (let keyIdx = 0; keyIdx < keyAxis.length; keyIdx++) {
      const label = keyAxis[keyIdx].labels[groupIdx]

      if (label != lastLabel) {
        if (startKeyIdx != null && lastLabel != null) {
          result[groupIdx].push({
            val: lastLabel,
            startIdx: startKeyIdx,
            endIdx: keyIdx
          })
          startKeyIdx = null
        }

        if (label != null) {
          startKeyIdx = keyIdx
        }
      }

      lastLabel = label
    }
  }

  return result
}
