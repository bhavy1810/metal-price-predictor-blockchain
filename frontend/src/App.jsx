import { useEffect, useMemo, useState } from 'react'
import { addPrice, deletePrice, getChain, predict, updatePrice } from './api'

const METALS = ['silver', 'gold', 'platinum']
const GOLD_PURITY = ['18K', '22K', '24K']
const UNITS = ['1g', '10g', '1kg']

export default function App() {
  const [chain, setChain] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [form, setForm] = useState({
    date: '',
    metal: 'silver',
    purity: '',
    unit: '1g', 
    price: '',
  })
  const [predictFilter, setPredictFilter] = useState({
    metal: 'silver',
    purity: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')

  const predictionPayload = useMemo(
    () => ({
      daysAhead: 1,
      metal: predictFilter.metal,
      purity: predictFilter.metal === 'gold' ? predictFilter.purity : null,
    }),
    [predictFilter]
  )

  const loadData = async () => {
    setError('')
    try {
      const [chainData, predictionData] = await Promise.all([getChain(), predict(predictionPayload)])
      setChain(chainData)
      setPrediction(predictionData)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictionPayload.metal, predictionPayload.purity])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await addPrice({
        date: form.date,
        metal: form.metal,
        purity: form.metal === 'gold' ? form.purity : null,
        unit: form.unit,
        price: Number(form.price),
      })
      setForm((prev) => ({ ...prev, date: '', price: '' }))
      await loadData()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (block) => {
    const current = block.data
    const newDate = window.prompt('Update date (YYYY-MM-DD):', current.date)
    if (newDate === null) return

    const newUnitInput = window.prompt('Update unit (1g / 10g / 1kg):', current.unit)
    if (newUnitInput === null) return
    const newUnit = newUnitInput.trim().toLowerCase()
    if (!UNITS.includes(newUnit)) {
      setError('Unit must be 1g, 10g, or 1kg')
      return
    }

    let newPurity = current.purity || null
    if (current.metal === 'gold') {
      const purityInput = window.prompt('Update gold purity (18K / 22K / 24K):', current.purity || '24K')
      if (purityInput === null) return
      newPurity = purityInput.trim().toUpperCase()
      if (!GOLD_PURITY.includes(newPurity)) {
        setError('Gold purity must be 18K, 22K, or 24K')
        return
      }
    }

    const newPriceInput = window.prompt('Update price in INR for selected unit:', String(current.price))
    if (newPriceInput === null) return

    const newPrice = Number(newPriceInput)
    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      setError('Price must be a positive number')
      return
    }

    setError('')
    setActionLoading(`update-${block.index}`)
    try {
      await updatePrice(block.index, {
        date: newDate,
        metal: current.metal,
        purity: current.metal === 'gold' ? newPurity : null,
        unit: newUnit,
        price: newPrice,
      })
      await loadData()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionLoading('')
    }
  }

  const handleDelete = async (block) => {
    const d = block.data
    const shouldDelete = window.confirm(
      `Remove #${block.index} (${d.metal.toUpperCase()} ${d.purity || ''} ${d.unit} - Rs ${d.price})?`
    )
    if (!shouldDelete) return

    setError('')
    setActionLoading(`delete-${block.index}`)
    try {
      await deletePrice(block.index)
      await loadData()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionLoading('')
    }
  }

  return (
    <main className="page">
      <h1>Metal Price Blockchain Predictor</h1>
      <p className="subtitle">
        Track Silver, Gold (18K/22K/24K), and Platinum prices in INR for 1g, 10g, and 1kg.
      </p>

      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2>Add Price</h2>
        <form onSubmit={handleSubmit} className="form">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            required
          />

          <select
            value={form.metal}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                metal: e.target.value,
                purity: e.target.value === 'gold' ? p.purity || '24K' : '',
              }))
            }
          >
            {METALS.map((metal) => (
              <option key={metal} value={metal}>
                {metal}
              </option>
            ))}
          </select>

          <select
            value={form.purity}
            onChange={(e) => setForm((p) => ({ ...p, purity: e.target.value }))}
            disabled={form.metal !== 'gold'}
            required={form.metal === 'gold'}
          >
            <option value="">Purity</option>
            {GOLD_PURITY.map((purity) => (
              <option key={purity} value={purity}>
                {purity}
              </option>
            ))}
          </select>

          <select value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>

          <input
            type="number"
            step="0.0001"
            placeholder="Price (INR)"
            value={form.price}
            onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Commit to Chain'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Prediction</h2>
        <div className="form">
          <select
            value={predictFilter.metal}
            onChange={(e) =>
              setPredictFilter((p) => ({
                ...p,
                metal: e.target.value,
                purity: e.target.value === 'gold' ? p.purity || '24K' : '',
              }))
            }
          >
            {METALS.map((metal) => (
              <option key={metal} value={metal}>
                {metal}
              </option>
            ))}
          </select>

          <select
            value={predictFilter.purity}
            onChange={(e) => setPredictFilter((p) => ({ ...p, purity: e.target.value }))}
            disabled={predictFilter.metal !== 'gold'}
          >
            <option value="">Purity</option>
            {GOLD_PURITY.map((purity) => (
              <option key={purity} value={purity}>
                {purity}
              </option>
            ))}
          </select>
        </div>

        {prediction ? (
          <>
            <p>
              Series: <strong>{prediction.metal.toUpperCase()}</strong>{' '}
              {prediction.purity ? <strong>{prediction.purity}</strong> : null}
            </p>
            {prediction.can_predict ? (
              <>
                <p>
                  Next day estimate (1g): <strong>Rs {prediction.predicted_price_inr_1g}</strong>{' '}
                  {prediction.currency}
                </p>
                <p>
                  Next day estimate (10g): <strong>Rs {prediction.predicted_price_inr_10g}</strong>{' '}
                  {prediction.currency}
                </p>
                <p>
                  Next day estimate (1kg): <strong>Rs {prediction.predicted_price_inr_1kg}</strong>{' '}
                  {prediction.currency}
                </p>
              </>
            ) : (
              <p>{prediction.message}</p>
            )}
          </>
        ) : (
          <p>No prediction yet.</p>
        )}
      </section>

      <section className="card">
        <h2>Blockchain</h2>
        {chain ? (
          <>
            <p>
              Blocks: {chain.length} | Valid: {String(chain.is_valid)} | Difficulty Prefix:{' '}
              {chain.difficulty_prefix}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Metal</th>
                    <th>Purity</th>
                    <th>Unit</th>
                    <th>Price (INR)</th>
                    <th>Hash</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.blocks
                    .filter((b) => b.data.price)
                    .map((b) => (
                      <tr key={b.hash}>
                        <td>{b.index}</td>
                        <td>{b.data.date}</td>
                        <td>{String(b.data.metal || '').toUpperCase()}</td>
                        <td>{b.data.purity || '-'}</td>
                        <td>{b.data.unit}</td>
                        <td>{b.data.price}</td>
                        <td className="hash">{b.hash.slice(0, 16)}...</td>
                        <td className="actions">
                          <button
                            type="button"
                            onClick={() => handleUpdate(b)}
                            disabled={actionLoading === `update-${b.index}`}
                          >
                            {actionLoading === `update-${b.index}` ? 'Updating...' : 'Update'}
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleDelete(b)}
                            disabled={actionLoading === `delete-${b.index}`}
                          >
                            {actionLoading === `delete-${b.index}` ? 'Removing...' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>Loading blockchain...</p>
        )}
      </section>
    </main>
  )
}
