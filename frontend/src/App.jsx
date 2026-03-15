import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

/**
 * Página inicial do front React.
 * Substitua este conteúdo pelo layout e telas do seu design do Figma.
 * Use as rotas abaixo para organizar: Dashboard, Clientes, etc.
 */
function App() {
  return (
    <BrowserRouter basename="/app">
      <div style={{ padding: '1rem', maxWidth: 1200, margin: '0 auto' }}>
        <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
          <Link to="/">Início</Link>
          <Link to="/dashboard">Dashboard</Link>
          <a href="/">Voltar ao site Django (templates)</a>
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

function Home() {
  return (
    <div>
      <h1>Frontend React</h1>
      <p>Integre aqui as telas do seu design do Figma. Este projeto usa Vite + React e consome a API do Django.</p>
    </div>
  )
}

function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Exemplo de rota. Conecte à API do Django para buscar dados (ex.: /api/dashboard/).</p>
    </div>
  )
}

export default App
