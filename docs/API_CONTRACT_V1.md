# Tharaa Market API — Version 1 Contract (Frozen)

This document freezes **API Version 1** for Flutter integration.

Official machine-readable contract:

- Runtime: `GET /api/docs-json`
- Artifact: [`docs/openapi-v1.json`](./openapi-v1.json) (written on API startup)

## Stability rules

Breaking changes are **not allowed** in v1 for:

- Endpoint URLs under `/api/v1`
- Request body schemas
- Response body schemas (including success/error envelopes)
- Authentication and refresh-token flows
- Enum string values
- Pagination (`page`, `limit`, `meta`)
- Error response format
- Upload multipart field name (`file`) and MIME policy

Incompatible changes require a new prefix such as `/api/v2`.

## Response envelopes

Success:

```json
{ "success": true, "data": {}, "meta": {} }
```

Error:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "...",
  "errorCode": "optional",
  "details": [],
  "timestamp": "ISO-8601",
  "path": "/api/v1/..."
}
```

## Startup

Flutter should call `GET /api/v1/bootstrap` once at startup instead of chaining multiple config requests.
