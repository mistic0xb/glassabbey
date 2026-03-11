FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Copy dist to shared volume on start
CMD ["sh", "-c", "cp -r /app/dist/. /app/dist-volume/ && echo 'Build copied'"]