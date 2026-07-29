# Scalable Application Deployer

A cloud-based platform for deploying frontend applications from Git repositories with real-time build logs and automatic subdomain-based hosting. Similar to Vercel or Netlify, this system automatically builds and deploys your projects to the cloud.

## Features

- **Automated Deployments**: Deploy applications directly from Git repositories
- **Real-time Build Logs**: Stream build logs in real-time via WebSockets
- **Scalable Architecture**: Built on Kubernetes, with each build running as an isolated, ephemeral Job
- **Subdomain Routing**: Each deployment gets a unique subdomain
- **S3 Static Hosting**: Optimized hosting for static assets
- **Modern UI**: Clean, responsive Next.js frontend with TailwindCSS

## Architecture

The system consists of four main components:

### 1. Frontend (`frontend/`)
- **Technology**: Next.js 14, React 18, TypeScript, TailwindCSS, DaisyUI
- **Purpose**: Web interface for submitting deployments and viewing real-time logs
- **Features**:
  - Git repository URL input
  - Custom slug assignment for subdomain
  - Real-time build log streaming
  - Deployment status tracking

### 2. API Server (`api-server/`)
- **Technology**: Express.js, Socket.io, `@kubernetes/client-node`, Redis
- **Purpose**: Orchestrates deployments and manages real-time communications
- **Responsibilities**:
  - Accepts deployment requests
  - Authenticates in-cluster (via the `api-server-sa` ServiceAccount) and creates a Kubernetes `Job` per build
  - Manages WebSocket connections for log streaming
  - Redis pub/sub for log distribution

### 3. Build Server (`build-server/`)
- **Technology**: Node.js, Docker, AWS SDK (S3), Redis
- **Purpose**: Containerized build environment for cloning, building, and deploying projects. Runs as a Kubernetes `Job` — one Pod per deployment, torn down after it finishes.
- **Workflow**:
  1. Clones Git repository
  2. Installs dependencies (`npm install`)
  3. Builds project (`npm run build`)
  4. Uploads static files to S3
  5. Publishes logs to Redis

### 4. S3 Reverse Proxy (`s3-reverse-proxy/`)
- **Technology**: Express.js, http-proxy
- **Purpose**: Routes subdomain requests to corresponding S3 buckets
- **Functionality**: Maps `{slug}.localhost:8000` to S3 bucket paths

## System Flow

```
User submits Git URL + slug
         ↓
    API Server (Deployment)
         ↓
  BatchV1Api.createNamespacedJob()
         ↓
   Build Server (Job → Pod, one per deploy)
         ↓
   Clone → Install → Build → Upload to S3
         ↓
   Job completes and is garbage-collected (ttlSecondsAfterFinished)
         ↓
   Logs → Redis → Socket.io → Frontend
         ↓
   Access via subdomain (s3-reverse-proxy Deployment)
```

api-server, frontend, and s3-reverse-proxy run as long-lived Kubernetes `Deployments`. Each build is a one-shot `Job` — there is no persistent build worker to manage or scale.

## Prerequisites

- Node.js (v20 or higher)
- Docker
- A Kubernetes cluster (kubectl configured with cluster-admin or equivalent to apply manifests)
- A container registry (ECR, Docker Hub, GCR, etc.) — used purely as an image registry, unrelated to how builds are scheduled
- AWS S3 Bucket for build output (used by `build-server` and `s3-reverse-proxy`; unrelated to how builds are scheduled)
- Redis instance

## Configuration

### API Server Configuration

The API server authenticates to the Kubernetes API **in-cluster** using the `api-server-sa` ServiceAccount (see [`k8s/03-rbac.yaml`](k8s/03-rbac.yaml)) — no kubeconfig or static credentials are baked into the image. Configuration is via environment variables, set on the `api-server` Deployment (see [`k8s/01-api-server.yaml`](k8s/01-api-server.yaml)):

```yaml
env:
  - name: K8S_NAMESPACE
    value: app-deployer
  - name: BUILD_SERVER_IMAGE
    value: <YOUR_REGISTRY>/app-deployer-build-server:latest
  - name: REDIS_URL
    valueFrom:
      secretKeyRef:
        name: deployer-secrets
        key: redis-url
```

On each deploy request, the API server calls `BatchV1Api.createNamespacedJob()`, submitting a Job derived from [`k8s/02-build-job-template.yaml`](k8s/02-build-job-template.yaml) with `${DEPLOY_ID}` and `${GIT_REPO_URL}` substituted in for that request.

### Build Server Configuration

Edit `build-server/script.js`:

```javascript
// Redis connection
const publisher = new Redis('YOUR_REDIS_URL');

// S3 configuration
const s3Client = new S3Client({
    region:'YOUR_AWS_REGION',
    credentials:{
        accessKeyId:'YOUR_ACCESS_KEY',
        secretAccessKey:'YOUR_SECRET_KEY'
    }
})

// Update bucket name
Bucket:'YOUR_S3_BUCKET_NAME'
```

### S3 Reverse Proxy Configuration

Edit `s3-reverse-proxy/index.js`:

```javascript
const BASE_PATH = 'https://YOUR_BUCKET.s3.YOUR_REGION.amazonaws.com/__outputs';
```

### Frontend Configuration

Edit `frontend/src/app/page.tsx`:

```javascript
const backend_url = 'http://YOUR_API_SERVER:9000'
const socket = io("http://YOUR_API_SERVER:9002");
```

## Installation

### 1. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 2. Install API Server Dependencies

```bash
cd api-server
npm install
```

### 3. Install Build Server Dependencies

```bash
cd build-server
npm install
```

### 4. Install S3 Reverse Proxy Dependencies

```bash
cd s3-reverse-proxy
npm install
```

### 5. Build and Push Docker Images

Each component is containerized. Build and push all four images to your registry:

```bash
docker build -t <YOUR_REGISTRY>/app-deployer-api-server:latest api-server/
docker build -t <YOUR_REGISTRY>/app-deployer-build-server:latest build-server/
docker build -t <YOUR_REGISTRY>/app-deployer-frontend:latest frontend/
docker build -t <YOUR_REGISTRY>/app-deployer-s3-reverse-proxy:latest s3-reverse-proxy/

docker push <YOUR_REGISTRY>/app-deployer-api-server:latest
docker push <YOUR_REGISTRY>/app-deployer-build-server:latest
docker push <YOUR_REGISTRY>/app-deployer-frontend:latest
docker push <YOUR_REGISTRY>/app-deployer-s3-reverse-proxy:latest
```

Update the `image:` field in each manifest under [`k8s/`](k8s/) to point at your registry (they currently use the `<YOUR_REGISTRY>/...` placeholder).

## Running the Application

### Development Mode

1. **Start API Server**:
```bash
cd api-server
node index.js
```
Runs on port 9000 (HTTP) and 9002 (WebSocket). Locally (outside a cluster) this requires a reachable Kubernetes API — e.g. point `KUBECONFIG` at a local cluster (kind/minikube) and swap `kc.loadFromCluster()` for `kc.loadFromDefault()` for local dev.

2. **Start S3 Reverse Proxy**:
```bash
cd s3-reverse-proxy
node index.js
```
Runs on port 8000

3. **Start Frontend**:
```bash
cd frontend
npm run dev
```
Runs on port 3000

### Production Mode (Kubernetes)

1. Create the namespace and RBAC first, since later manifests depend on them:
```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/03-rbac.yaml
```

2. Create the `deployer-secrets` Secret referenced by the manifests (Redis URL, S3 bucket, etc.) — not checked into the repo:
```bash
kubectl create secret generic deployer-secrets \
  --namespace app-deployer \
  --from-literal=redis-url='<YOUR_REDIS_URL>' \
  --from-literal=s3-bucket='<YOUR_S3_BUCKET>'
```

3. Apply the long-running services:
```bash
kubectl apply -f k8s/01-api-server.yaml
kubectl apply -f k8s/04-proxy-and-frontend.yaml
```

4. The build Job template (`k8s/02-build-job-template.yaml`) is **not** applied directly — the API server submits a Job derived from it via `BatchV1Api.createNamespacedJob()` on every deploy request. One Job → one Pod → one build, cleaned up automatically after `ttlSecondsAfterFinished`.

```bash
kubectl get deployments -n app-deployer
kubectl get jobs -n app-deployer --watch
```

## Kubernetes Manifests (`k8s/`)

| File | Kind(s) | Purpose |
|---|---|---|
| `00-namespace.yaml` | Namespace | `app-deployer` namespace all resources live in |
| `01-api-server.yaml` | Deployment, Service | Long-running api-server |
| `02-build-job-template.yaml` | Job | Template the api-server clones per build (`${DEPLOY_ID}`, `${GIT_REPO_URL}` substituted at request time) — not applied directly |
| `03-rbac.yaml` | ServiceAccount, Role, RoleBinding | `api-server-sa`, scoped to create/list/watch/delete `jobs` and read `pods`/`pods/log` in-namespace |
| `04-proxy-and-frontend.yaml` | Deployment, Service ×2 | Long-running s3-reverse-proxy and frontend |

## Usage

1. Open the frontend application in your browser
2. Enter a unique slug for your deployment
3. Provide the Git repository URL (must be publicly accessible)
4. Click "Deploy"
5. Watch real-time build logs
6. Once complete, access your deployed application at the provided URL

## Supported Project Types

The build server supports any frontend project with:
- `npm install` for dependency installation
- `npm run build` for building
- Output to either `/dist` or `/build` directory

This includes:
- React applications
- Vue.js applications
- Vite projects
- Create React App projects
- Next.js static exports
- And more...

## Architecture Decisions

### Why a Kubernetes Job per build?
- Each build is isolated in its own Pod, with no shared state between builds
- Pods are automatically cleaned up (`ttlSecondsAfterFinished`) once a build finishes
- Scheduling, retries (`backoffLimit`), and resource limits are handled natively by the cluster
- The container registry (ECR or otherwise) is just where images are pulled from — it's decoupled from how/where builds run

### Why Redis?
- Fast pub/sub messaging
- Decouples build server from API server
- Supports multiple subscribers

### Why S3 + Reverse Proxy?
- Cost-effective static hosting
- High availability
- Scalable storage
- Subdomain-based routing flexibility

## Security Considerations

Before deploying to production:

1. **Add Authentication**: Implement user authentication and authorization
2. **Validate Git URLs**: Sanitize and validate repository URLs
3. **Rate Limiting**: Add rate limiting to prevent abuse
4. **Secure Credentials**: Use Kubernetes Secrets (or an external secrets manager) — never bake credentials into images or source
5. **RBAC Scope**: Keep the `api-server-sa` Role scoped to only `jobs` and `pods`/`pods/log` in its own namespace (see [`k8s/03-rbac.yaml`](k8s/03-rbac.yaml)) — avoid cluster-wide permissions
6. **CORS Configuration**: Restrict CORS to specific domains
7. **Input Validation**: Validate all user inputs including slug format

## Limitations

- Only supports publicly accessible Git repositories
- Requires `npm` as the package manager
- Build must complete before the Job's `backoffLimit` is exhausted
- No build caching (each build starts fresh)
- Limited to static site deployments

## Future Enhancements

- Support for private repositories (SSH keys, OAuth)
- Build caching for faster deployments
- Support for multiple package managers (yarn, pnpm)
- Custom domain mapping
- Environment variable configuration
- Deployment rollbacks
- CI/CD pipeline integration
- Build history and analytics
- Resource usage monitoring

## Troubleshooting

### Builds Not Starting
- Check the api-server logs for RBAC errors (`Forbidden`) — verify `api-server-sa` has the `job-launcher` Role bound in its namespace ([`k8s/03-rbac.yaml`](k8s/03-rbac.yaml))
- Confirm the api-server Deployment's pod spec sets `serviceAccountName: api-server-sa`
- `kubectl get jobs -n app-deployer` / `kubectl describe job build-<slug> -n app-deployer` to see why a Job failed to schedule
- Verify `BUILD_SERVER_IMAGE` points at a pullable image and `deployer-secrets` exists in the namespace

### Real-time Logs Not Appearing
- Verify Redis connection in both API server and build server
- Check WebSocket connection in browser console
- Ensure correct channel subscription (`logs:{slug}`)

### Deployment Not Accessible
- Verify S3 bucket permissions
- Check reverse proxy configuration
- Ensure CORS is configured on S3 bucket

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
