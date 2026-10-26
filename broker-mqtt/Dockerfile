FROM python:3.12-slim
WORKDIR /app
COPY broker.py paquetes.py temas.py usuarios.py ./
RUN useradd --system --no-create-home broker
USER broker
EXPOSE 1883
CMD ["python", "-u", "broker.py"]
