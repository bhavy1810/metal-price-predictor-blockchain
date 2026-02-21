# Metal Price Prediction (Blockchain + React + FastAPI)

Simple full-stack project:
- Frontend: React + Vite
- Backend: FastAPI
- Feature: Save metal prices into a basic blockchain, then predict next-day price with linear regression.

Supported:
- Silver: 1g, 10g, 1kg
- Gold: 18K, 22K, 24K with 1g, 10g, 1kg
- Platinum: 1g, 10g, 1kg

## 1) Run backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## 2) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173

## API
- `GET /chain` blockchain data
- `POST /prices` add new record
  - Example body:
    - `{ "date": "2026-02-21", "metal": "silver", "purity": null, "unit": "1g", "price": 92.5 }`
    - `{ "date": "2026-02-21", "metal": "gold", "purity": "22K", "unit": "10g", "price": 64200 }`
- `PUT /prices/{block_index}` update a price block
- `DELETE /prices/{block_index}` remove a price block
- `GET /predict?days_ahead=1&metal=silver`
- `GET /predict?days_ahead=1&metal=gold&purity=24K`

Prediction response includes INR values for:
- 1g
- 10g
- 1kg
