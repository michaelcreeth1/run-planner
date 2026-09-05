FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml requirements.lock /app/
RUN pip install --no-cache-dir --constraint requirements.lock .

COPY app /app/app
COPY migrations /app/migrations

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
