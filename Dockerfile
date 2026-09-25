FROM node:24-alpine
WORKDIR /app
COPY app.mjs demo.mjs ./
USER node
CMD ["node", "app.mjs"]
