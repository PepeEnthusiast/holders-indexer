# Holders Indexer

`holders-indexer` indexes blockchain addresses using Electrs, providing an easy way to query and paginate holder data.

---

## Features

* Indexes blockchain addresses
* Provides paginated API endpoint

---

## Endpoints

### Get Addresses

```http
GET /addresses?page=1&limit=100
```

**Query Parameters:**

* `page` - (optional) Page number for pagination (default: 1)
* `limit` - (optional) Number of results per page (default: 50)

**Example Response:**

```json
{
  "page": 1,
  "limit": 69,
  "total": 420,
  "data": [
    {"address": "xxxxxxxxxxx", "balance": "0"},
  ]
}
```

---

## Running with Docker

Clone the repository and start the services using Docker Compose:

```bash
git clone https://github.com/PepeEnthusiast/holders-indexer.git
cd holders-indexer
docker-compose up -d
```

You can configure `holders-indexer` by editing environment variables. For example:

```yaml
environment:
  - ELECTRS_URL=http://electrs:3000
```

* `ELECTRS_URL` points to your Electrs node.
* The API will be available at `http://localhost:4000`.

---

**TODO:** Handle blockchain reorgs