import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import DriverPortal from './portals/driver/DriverPortal'
import PortPortal from './portals/port/PortPortal'
import './portals/port/port.css'

function Home() {
  return <main className="portal-home"><h1>CoastWatch</h1><p>Coastal supply chain operations</p><div className="portal-links"><Link to="/driver"><h2>Driver portal</h2><p>Shipment, navigation, alerts and incident demonstrations</p></Link><Link to="/port"><h2>Port authority</h2><p>Control tower, cargo, incidents and recovery decisions</p></Link></div><p>Demonstration workspace · Simulated operational data</p></main>
}
export default function App() {
  return <BrowserRouter><nav className="portal-nav" aria-label="Portals"><Link to="/">CoastWatch</Link><Link to="/driver">Driver</Link><Link to="/port">Port authority</Link></nav><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/driver" element={<DriverPortal />} />
    <Route path="/port" element={<div className="port-portal"><PortPortal /></div>} />
    <Route path="*" element={<main className="portal-home">Page not found. <Link to="/">Choose a portal</Link></main>} />
  </Routes></BrowserRouter>
}
