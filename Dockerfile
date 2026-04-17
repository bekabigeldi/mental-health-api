FROM python:3.10-slim

WORKDIR /app

# 👇 исправлено
COPY Backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# 👇 копируем весь backend
COPY Backend/ .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
