FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates && update-ca-certificates

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=80
EXPOSE 80

CMD ["npm", "start"]
