from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator


DIFFICULTY_PREFIX = "00"
ALLOWED_METALS = {"silver", "gold", "platinum"}
ALLOWED_GOLD_PURITY = {"18K", "22K", "24K"}
ALLOWED_UNITS = {"1g", "10g", "1kg"}
UNIT_TO_GRAMS = {"1g": 1, "10g": 10, "1kg": 1000}


@dataclass
class Block:
    index: int
    timestamp: float
    data: dict
    prev_hash: str
    nonce: int = 0
    hash: str = ""

    def compute_hash(self) -> str:
        payload = f"{self.index}{self.timestamp}{self.data}{self.prev_hash}{self.nonce}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()


class Blockchain:
    def __init__(self) -> None:
        self.chain: List[Block] = []
        self._create_genesis_block()

    def _create_genesis_block(self) -> None:
        genesis = Block(index=0, timestamp=time.time(), data={"event": "genesis"}, prev_hash="0")
        genesis.hash = genesis.compute_hash()
        self.chain.append(genesis)

    def _mine_block(self, block: Block) -> None:
        while True:
            block_hash = block.compute_hash()
            if block_hash.startswith(DIFFICULTY_PREFIX):
                block.hash = block_hash
                return
            block.nonce += 1

    def add_block(self, data: dict) -> Block:
        prev_block = self.chain[-1]
        new_block = Block(
            index=len(self.chain),
            timestamp=time.time(),
            data=data,
            prev_hash=prev_block.hash,
        )
        self._mine_block(new_block)
        self.chain.append(new_block)
        return new_block

    def _reindex_and_remine_from(self, start_index: int) -> None:
        for i in range(start_index, len(self.chain)):
            block = self.chain[i]
            previous = self.chain[i - 1]
            block.index = i
            block.prev_hash = previous.hash
            block.nonce = 0
            self._mine_block(block)

    def update_price_block(self, block_index: int, data: dict) -> Block:
        if block_index <= 0 or block_index >= len(self.chain):
            raise ValueError("block_index out of range")

        block = self.chain[block_index]
        if "price" not in block.data:
            raise ValueError("selected block is not a price block")

        block.data = data
        self._reindex_and_remine_from(block_index)
        return block

    def delete_price_block(self, block_index: int) -> None:
        if block_index <= 0 or block_index >= len(self.chain):
            raise ValueError("block_index out of range")

        block = self.chain[block_index]
        if "price" not in block.data:
            raise ValueError("selected block is not a price block")

        del self.chain[block_index]
        if len(self.chain) > block_index:
            self._reindex_and_remine_from(block_index)

    def is_valid(self) -> bool:
        for i in range(1, len(self.chain)):
            current = self.chain[i]
            previous = self.chain[i - 1]
            if current.prev_hash != previous.hash:
                return False
            if current.compute_hash() != current.hash:
                return False
            if not current.hash.startswith(DIFFICULTY_PREFIX):
                return False
        return True

    def get_price_points(self, metal: str, purity: Optional[str]) -> List[tuple[int, float]]:
        points: List[tuple[int, float]] = []
        for block in self.chain[1:]:
            data = block.data
            if "price" not in data:
                continue
            if data.get("metal") != metal:
                continue
            if metal == "gold":
                if data.get("purity") != purity:
                    continue
            points.append((len(points), float(data["price_inr_1g"])))
        return points


def linear_regression_predict(points: List[tuple[int, float]], days_ahead: int = 1) -> float:
    if len(points) < 2:
        raise ValueError("Need at least two data points to predict")

    n = len(points)
    sum_x = sum(p[0] for p in points)
    sum_y = sum(p[1] for p in points)
    sum_xy = sum(p[0] * p[1] for p in points)
    sum_x2 = sum(p[0] ** 2 for p in points)

    denominator = (n * sum_x2) - (sum_x ** 2)
    if denominator == 0:
        raise ValueError("Unable to compute prediction for this dataset")

    slope = ((n * sum_xy) - (sum_x * sum_y)) / denominator
    intercept = (sum_y - (slope * sum_x)) / n

    next_x = (n - 1) + days_ahead
    predicted = intercept + (slope * next_x)
    return round(predicted, 4)


class PriceIn(BaseModel):
    date: str = Field(..., description="Date in YYYY-MM-DD")
    metal: str = Field(..., description="silver | gold | platinum")
    purity: Optional[str] = Field(default=None, description="For gold only: 18K | 22K | 24K")
    unit: str = Field(..., description="1g | 10g | 1kg")
    price: float = Field(..., gt=0, description="Price in INR for the selected unit")

    @model_validator(mode="after")
    def validate_payload(self) -> "PriceIn":
        self.metal = self.metal.lower()
        self.unit = self.unit.lower()
        if self.purity:
            self.purity = self.purity.upper()

        if self.metal not in ALLOWED_METALS:
            raise ValueError("metal must be one of silver, gold, platinum")
        if self.unit not in ALLOWED_UNITS:
            raise ValueError("unit must be one of 1g, 10g, 1kg")

        if self.metal == "gold":
            if self.purity not in ALLOWED_GOLD_PURITY:
                raise ValueError("gold purity must be one of 18K, 22K, 24K")
        else:
            if self.purity is not None:
                raise ValueError("purity is allowed only for gold")

        return self


app = FastAPI(title="Metal Price Chain API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chain = Blockchain()


def normalize_price_data(payload: PriceIn) -> dict:
    grams = UNIT_TO_GRAMS[payload.unit]
    price_inr_1g = round(payload.price / grams, 4)
    return {
        "date": payload.date,
        "metal": payload.metal,
        "purity": payload.purity,
        "unit": payload.unit,
        "price": payload.price,
        "price_inr_1g": price_inr_1g,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "chain_valid": chain.is_valid()}


@app.get("/chain")
def get_chain() -> dict:
    return {
        "length": len(chain.chain),
        "is_valid": chain.is_valid(),
        "difficulty_prefix": DIFFICULTY_PREFIX,
        "blocks": [asdict(b) for b in chain.chain],
    }


@app.post("/prices")
def add_price(payload: PriceIn) -> dict:
    try:
        datetime.strptime(payload.date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date must be in YYYY-MM-DD format") from exc

    block = chain.add_block(normalize_price_data(payload))
    return {
        "message": "Price committed to blockchain",
        "block": asdict(block),
    }


@app.put("/prices/{block_index}")
def update_price(block_index: int, payload: PriceIn) -> dict:
    try:
        datetime.strptime(payload.date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date must be in YYYY-MM-DD format") from exc

    try:
        block = chain.update_price_block(block_index, normalize_price_data(payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "message": "Price block updated",
        "block": asdict(block),
    }


@app.delete("/prices/{block_index}")
def delete_price(block_index: int) -> dict:
    try:
        chain.delete_price_block(block_index)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"message": "Price block removed", "length": len(chain.chain)}


@app.get("/predict")
def predict(days_ahead: int = 1, metal: str = "silver", purity: Optional[str] = None) -> dict:
    if days_ahead < 1:
        raise HTTPException(status_code=400, detail="days_ahead must be >= 1")

    metal = metal.lower()
    purity_value = purity.upper() if purity else None

    if metal not in ALLOWED_METALS:
        raise HTTPException(status_code=400, detail="metal must be one of silver, gold, platinum")
    if metal == "gold" and purity_value not in ALLOWED_GOLD_PURITY:
        raise HTTPException(status_code=400, detail="gold purity must be one of 18K, 22K, 24K")
    if metal != "gold" and purity is not None:
        raise HTTPException(status_code=400, detail="purity is allowed only for gold")

    points = chain.get_price_points(metal=metal, purity=purity_value)
    if len(points) < 2:
        return {
            "days_ahead": days_ahead,
            "metal": metal,
            "purity": purity_value,
            "predicted_price_inr_1g": None,
            "predicted_price_inr_10g": None,
            "predicted_price_inr_1kg": None,
            "currency": "INR",
            "based_on_points": len(points),
            "can_predict": False,
            "message": "Need at least two data points to predict",
        }

    prediction_inr_1g = linear_regression_predict(points, days_ahead=days_ahead)

    return {
        "days_ahead": days_ahead,
        "metal": metal,
        "purity": purity_value,
        "predicted_price_inr_1g": prediction_inr_1g,
        "predicted_price_inr_10g": round(prediction_inr_1g * 10, 2),
        "predicted_price_inr_1kg": round(prediction_inr_1g * 1000, 2),
        "currency": "INR",
        "based_on_points": len(points),
        "can_predict": True,
        "message": "Prediction generated",
    }
