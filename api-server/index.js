const express = require('express');
const k8s = require('@kubernetes/client-node');
const cors = require('cors');
const bodyParser = require('body-parser');
const {Server} = require('socket.io');
const Redis = require('ioredis');

const app = express();
const PORT = 9000

//redis api
const subscriber = new Redis('');

const io = new Server({cors:'*'});

io.on('connection', socket => {
    socket.on('subscribe',channel => {
        socket.join(channel);
        // socket.emit('message',`Joined ${channel}`);
    })
})

io.listen(9002,()=>console.log('Socket server 9002'))

const kc = new k8s.KubeConfig();
kc.loadFromCluster();

const batchApi = kc.makeApiClient(k8s.BatchV1Api);
const K8S_NAMESPACE = process.env.K8S_NAMESPACE || 'app-deployer';
const BUILD_SERVER_IMAGE = process.env.BUILD_SERVER_IMAGE;

// app.use(express.json)
app.use(cors());
app.use(bodyParser.json());

app.post('/project', async (req, res) => {
    const gitURL = req.body.gitURL;
    const projectSlug = req.body.slug;

    // spin up a build Job from the template, with DEPLOY_ID/GIT_REPO_URL substituted in
    const jobManifest = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: `build-${projectSlug}`,
            namespace: K8S_NAMESPACE,
            labels: {app: 'build-server', deployId: projectSlug}
        },
        spec: {
            backoffLimit: 2,
            ttlSecondsAfterFinished: 3600,
            template: {
                metadata: {
                    labels: {app: 'build-server', deployId: projectSlug}
                },
                spec: {
                    restartPolicy: 'Never',
                    containers: [
                        {
                            name: 'build-server',
                            image: BUILD_SERVER_IMAGE,
                            env: [
                                {name: 'GIT_REPOSITORY__URL', value: gitURL},
                                {name: 'DEPLOY_ID', value: projectSlug},
                                {name: 'PROJECT_ID', value: projectSlug},
                                {name: 'REDIS_URL', valueFrom: {secretKeyRef: {name: 'deployer-secrets', key: 'redis-url'}}},
                                {name: 'S3_BUCKET', valueFrom: {secretKeyRef: {name: 'deployer-secrets', key: 's3-bucket'}}}
                            ],
                            resources: {
                                requests: {cpu: '500m', memory: '512Mi'},
                                limits: {cpu: '1', memory: '1Gi'}
                            }
                        }
                    ]
                }
            }
        }
    };

    await batchApi.createNamespacedJob({namespace: K8S_NAMESPACE, body: jobManifest});

    return res.status(200).send({status: 'queued', data: {projectSlug, url: `http://${projectSlug}.localhost:8000`}});
})


async function initRedisSubscibe(){
    console.log('Subscribed to logs ...')
    subscriber.psubscribe('logs:*');
    subscriber.on('pmessage',(pattern, channel, message) => {
        console.log(channel,message);
        io.to(channel).emit('message',message);
    })
}

initRedisSubscibe();

app.listen(PORT, () => console.log(`API server running on ${PORT}`));

