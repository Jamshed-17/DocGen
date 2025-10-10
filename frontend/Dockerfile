# document-generator/frontend/Dockerfile
# Базовый образ Node.js
FROM node:20-alpine

# Создание и установка рабочей директории
WORKDIR /app

# Копирование package.json и установка зависимостей
COPY package*.json ./
RUN npm install

# Копирование остального кода
COPY . .

# Команда для запуска (уже определена в docker-compose)
# CMD ["npm", "run", "dev"]