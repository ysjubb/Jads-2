FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm install -D typescript ts-node @types/node @types/express
COPY index.ts ./
RUN echo '{"compilerOptions":{"target":"ES2020","module":"commonjs","esModuleInterop":true,"skipLibCheck":true,"strict":true},"include":["index.ts"]}' > tsconfig.json
CMD ["npx", "ts-node", "--transpile-only", "index.ts"]
