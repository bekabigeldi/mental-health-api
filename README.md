# AI Early Warning System for Mental Health Risk Detection

Simple diploma-project MVP with:

- `frontend`: React + Vite + TailwindCSS
- `backend`: FastAPI + SQLite + scikit-learn

## Folder Structure

```text
Mental_Health/
  backend/
    main.py
    ml_model.py
    requirements.txt
  frontend/
    src/
    package.json
    tailwind.config.js
    vite.config.js
```

## Run Backend

```bash
cd /Users/bekabigeldigmail.com/Desktop/Mental_Health/backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs on `http://127.0.0.1:8000`

## Run Frontend

```bash
cd /Users/bekabigeldigmail.com/Desktop/Mental_Health/frontend
npm install
npm run dev
```

Frontend runs on `http://127.0.0.1:5173`

## Implemented Features

- Register and login with email/password
- Anonymous mode
- Daily mood check-in form
- Mental health risk score with `LOW`, `MEDIUM`, `HIGH`
- SQLite data storage
- Dashboard with latest result and recent history

## API Endpoints

- `POST /register`
- `POST /login`
- `POST /anonymous`
- `POST /mood`
- `GET /risk/{user_id}`
- `GET /history/{user_id}`

## Notes

- The ML model is a simple logistic regression trained on generated sample data.
- If scikit-learn is unavailable, the backend falls back to rule-based risk scoring.
- If your default `python3` is version `3.14`, use `python3.13` or `python3.12` for the backend virtual environment.
- This is an MVP for academic demonstration, not a medical diagnosis tool.
