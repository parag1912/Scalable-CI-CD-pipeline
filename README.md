# Scalable Application Deployer

A cloud-based platform for deploying frontend applications from Git repositories with real-time build logs and automatic subdomain-based hosting. Similar to Vercel or Netlify, this system automatically builds and deploys your projects to the cloud.

## Features

- **Automated Deployments**: Deploy applications directly from Git repositories
- **Real-time Build Logs**: Stream build logs in real-time via WebSockets
- **Scalable Architecture**: Built on AWS ECS Fargate for containerized, scalable builds
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
- **Technology**: Express.js, Socket.io, AWS SDK (ECS), Redis
- **Purpose**: Orchestrates deployments and manages real-time communications
- **Responsibilities**:
  - Accepts deployment requests
  - Triggers AWS ECS Fargate tasks
  - Manages WebSocket connections for log streaming
  - Redis pub/sub for log distribution

### 3. Build Server (`build-server/`)
- **Technology**: Node.js, Docker, AWS SDK (S3), Redis
- **Purpose**: Containerized build environment for cloning, building, and deploying projects
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
    API Server
         ↓
  AWS ECS Fargate Task
         ↓
   Build Server (Docker)
         ↓
   Clone → Install → Build → Upload to S3
         ↓
   Logs → Redis → Socket.io → Frontend
         ↓
   Access via subdomain
```

## Prerequisites

- Node.js (v20 or higher)
- Docker
- AWS Account with:
  - ECS Cluster configured
  - S3 Bucket for builds
  - IAM credentials with appropriate permissions
- Redis instance

## Configuration

### API Server Configuration

Edit `api-server/index.js`:

```javascript
// Redis connection
const subscriber = new Redis('YOUR_REDIS_URL');

// AWS ECS configuration
const ecsCLient = new ECSClient({
    region: 'YOUR_AWS_REGION',
    credentials:{
        accessKeyId:'YOUR_ACCESS_KEY',
        secretAccessKey:'YOUR_SECRET_KEY'
    }
})

const config = {
    CLUSTER: 'YOUR_ECS_CLUSTER',
    TASK: 'YOUR_TASK_DEFINITION'
}

// Update subnets and security groups
networkConfiguration: {
    awsvpcConfiguration: {
        assignPublicIp: 'ENABLED',
        subnets: ['subnet-1', 'subnet-2', ...],
        securityGroups: ['sg-xxx']
    }
}
```

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

### 5. Build Docker Image for Build Server

```bash
cd build-server
docker build -t build-server .
```

Push the image to your container registry (ECR, Docker Hub, etc.) and configure your ECS task definition to use it.

## Running the Application

### Development Mode

1. **Start API Server**:
```bash
cd api-server
node index.js
```
Runs on port 9000 (HTTP) and 9002 (WebSocket)

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

### Production Mode

1. Build frontend:
```bash
cd frontend
npm run build
npm start
```

2. Deploy API server and S3 reverse proxy to your hosting platform
3. Ensure Build Server Docker image is available in your container registry
4. Configure AWS ECS task definition

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

### Why AWS ECS Fargate?
- Serverless container execution
- No infrastructure management
- Automatic scaling
- Pay-per-use pricing

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
4. **Secure Credentials**: Use environment variables and AWS Secrets Manager
5. **Network Security**: Configure VPC, security groups, and NACLs properly
6. **CORS Configuration**: Restrict CORS to specific domains
7. **Input Validation**: Validate all user inputs including slug format

## Limitations

- Only supports publicly accessible Git repositories
- Requires `npm` as the package manager
- Build must complete within ECS task timeout
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
- Verify AWS credentials and permissions
- Check ECS cluster and task definition configuration
- Ensure subnets and security groups are correct

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
