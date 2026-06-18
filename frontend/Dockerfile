FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* /app/
RUN npm install

COPY . /app

CMD ["npm", "run", "dev"]
