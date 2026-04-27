# document-generator/backend/Dockerfile
# Базовый образ Python
FROM python:3.11-slim
RUN apt-get update && apt-get install -y poppler-utils

# Установка переменных окружения
ENV PYTHONUNBUFFERED 1

# Создание и установка рабочей директории
WORKDIR /app

# Установка зависимостей (сначала копируем только их, чтобы кешировать)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование остального кода
COPY . /app