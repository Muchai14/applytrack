.PHONY: up test down demo-incident rollback
up:
	docker compose up --build -d --wait
test:
	sh scripts/test.sh
down:
	docker compose down
demo-incident:
	python3 scripts/incident_demo.py
rollback:
	sh scripts/rollback.sh $(IMAGE)
