import { NavLink, Route, Routes } from 'react-router-dom'
import RunsPage from './pages/RunsPage'
import RunDetail from './pages/RunDetail'
import ComparePage from './pages/ComparePage'

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">NeuroSim Results</span>
        <nav>
          <NavLink to="/" end>Runs</NavLink>
          <NavLink to="/compare">Compare</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<RunsPage />} />
          <Route path="/runs/:id" element={<RunDetail />} />
          <Route path="/compare" element={<ComparePage />} />
        </Routes>
      </main>
    </div>
  )
}
