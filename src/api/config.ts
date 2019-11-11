import axios from 'axios'

const API_URL = process.env.REACT_APP_PD_CLIENT_URL
console.log(API_URL)
const http = axios.create({
  baseURL: `${API_URL}/pd/api/v1`
})

export {
  http
}
