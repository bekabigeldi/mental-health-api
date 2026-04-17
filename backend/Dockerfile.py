
# Используем Python
FROM python:3.10-slim

# Рабочая папка
WORKDIR /app

# Копируем зависимости
COPY requirements.txt .

# Устанавливаем зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь проект
COPY . .

# Открываем порт (Cloud Run требует 8080)
ENV PORT=8080

# Запуск сервера
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"] 
