FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm install -g typescript ts-node
RUN npx tsc

# Copy knowledge base
COPY knowledge ./knowledge

EXPOSE 3001

CMD ["node", "dist/server.js"]
