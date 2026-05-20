FROM node:20-alpine

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY src ./src

RUN npm ci --include=dev && npm run build && npm prune --production

ENV NODE_ENV=production
ENV TRANSPORT=http
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
