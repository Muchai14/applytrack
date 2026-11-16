import json
import logging
import os
import sys
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import CollectorRegistry, Counter, Histogram

registry = CollectorRegistry()
requests = Counter("applytrack_http_requests_total", "API journey requests", ["route", "method", "status"], registry=registry)
duration = Histogram("applytrack_http_request_duration_seconds", "API journey latency", ["route", "method"], registry=registry)
logger = logging.getLogger("applytrack")
logger.setLevel(logging.INFO)
logger.propagate = False
if not logger.handlers:
    logger.addHandler(logging.StreamHandler(sys.stdout))


def configure():
    if isinstance(trace.get_tracer_provider(), TracerProvider):
        return
    resource = Resource.create({"service.name": os.getenv("OTEL_SERVICE_NAME", "applytrack-api"), "deployment.environment": os.getenv("APP_ENV", "dev")})
    provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(provider)
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if endpoint:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint.rstrip("/")+"/v1/traces")))
        from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
        from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        logs = LoggerProvider(resource=resource)
        logs.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter(endpoint=endpoint.rstrip("/")+"/v1/logs")))
        logger.addHandler(LoggingHandler(level=logging.INFO, logger_provider=logs))


def log_event(event, **fields):
    ctx = trace.get_current_span().get_span_context()
    # Callers supply only fixed event names, sanitized routes/status and release IDs.
    logger.info(json.dumps({"event": event, "trace_id": f"{ctx.trace_id:032x}", **fields}))
