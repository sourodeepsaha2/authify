FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server ./server
COPY scripts ./scripts
CMD ["node", "server/index.js"]
