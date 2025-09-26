FROM node:bookworm-slim

WORKDIR /app

COPY . .

RUN npm install

RUN npm run build

CMD ["node", "dist/index.js"]