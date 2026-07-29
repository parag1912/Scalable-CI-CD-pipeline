FROM node:20-alpine

WORKDIR /home/app

COPY package*.json ./
RUN npm install --omit=dev

COPY index.js index.js

EXPOSE 8000

CMD [ "node", "index.js" ]
