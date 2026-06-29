FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_OPTIONS=--use-openssl-ca
ENV PORT=80
EXPOSE 80

CMD ["npm", "start"]
