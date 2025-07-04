# Quick Start

If you want to start quickly, navigate to the backend repository (`morse-back`) and run the following command:

```bash
docker compose up
```

---

# LR Chatbot

## Variables d'environnement

Copiez le fichier `.env.example` vers `.env` et configurez les variables suivantes :

### Configuration de base
- `GRAPHQL_URL` : URL du serveur GraphQL (défaut: `http://localhost:3001/graphql`)
- `GRAPHQL_WS_URL` : URL WebSocket du serveur GraphQL (défaut: `ws://localhost:3001/graphql`)
- `EMAIL` : Email de l'utilisateur pour l'authentification
- `PASSWORD` : Mot de passe de l'utilisateur
- `USER_ID` : ID de l'utilisateur

### Configuration de la file d'attente
- `PROCESSING_DELAY` : Délai en millisecondes entre le traitement des messages (défaut: `1000`)
- `MAX_RETRIES` : Nombre maximum de tentatives en cas d'échec (défaut: `3`)

## Installation

```bash
npm install
```

## Utilisation

```bash
npm start
```
