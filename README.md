# AI Document Assistant

RAG-basert webapp: last opp PDF-er og still spørsmål med kildehenvisninger.
Bygges stegvis. Full dokumentasjon kommer i Fase 11.

## Kjør (Fase 1)

```bash
cp .env.example .env   # endre POSTGRES_PASSWORD (og samme passord i DATABASE_URL)
docker compose up --build
```

- Frontend: http://localhost:5173
- API-docs: http://localhost:8000/docs
- Health: http://localhost:8000/health
