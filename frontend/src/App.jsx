import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import DriverPortal from './portals/driver/DriverPortal'
export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<Navigate to="/driver" replace />} />
    <Route path="/driver" element={<DriverPortal />} />
    <Route path="*" element={<main style={{ padding: 32 }}>Page not found. <a href="/driver">Open driver portal</a></main>} />
  </Routes></BrowserRouter>
}
