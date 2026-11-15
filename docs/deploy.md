# Deploy Sima for judging

The container serves the built page and `/api` on one port. Google Cloud Run is the primary option.
Azure Container Apps is the alternative. These commands are for the account owner to run. No cloud
login, resource creation or deployment was done while preparing these files.

Use a current CLI, an account with billing and permission to create these resources, and unused
names in place of the capitalised placeholders. Run commands from the repo root in Bash.
Do not put account keys or tokens in this repo.

## Local check

```bash
docker build -t sima-judging:local .
docker volume create sima-cache
docker run --rm --name sima-judging -p 5185:8080 \
  -e PORT=8080 -e SIMA_CACHE=/cache -v sima-cache:/cache sima-judging:local
# In another terminal:
curl --fail http://localhost:5185/api/health
```

Open http://localhost:5185/?intro=0. Stop this container with `docker stop sima-judging`.
Without Docker, install `scripts/requirements.txt` in a virtual environment, run
`VITE_LIVE_API=/api/patch npm run build`, then
`PORT=5185 SIMA_CACHE=/tmp/sima-demo-cache .venv/bin/python scripts/serve.py`.
The server never uses port 8765. `SIMA_DIST` can override its default `dist/` directory.
A custom cache mount must be writable by UID/GID 10001; the cloud examples set this explicitly.

The image builds with live fetching enabled. A static-only build uses the same source but an empty
`VITE_LIVE_API` at build time. Changing this variable when starting a container cannot change the
already built page.

HTML, manifests, data and the sky service worker revalidate (`no-cache`). Vite's hashed assets are
cached for a year. `.bin.gz` stays raw gzip bytes without `Content-Encoding`: the app decodes it.
Missing files return 404, never an HTML fallback. Workspace links use URL fragments, so no SPA rewrite
is needed. `/api/health` checks the local API; it does not check NASA availability.

## Google Cloud Run

Use one instance for the demo. Live queues and jobs belong to one Python process. More instances can
split polling between jobs and duplicate NASA requests, even with a shared cache. A new revision may
briefly overlap the old one: deploy before warming up and avoid updates during judging.

Cloud Run normally gives CPU only during requests. This app fetches NASA data between polls, so use
`--no-cpu-throttling`. Keep one instance warm. Start with 2 CPU and 4 GiB; wide fields need more memory
than the five shipped targets. Concurrency 40 allows static requests and polling while workers run.
The existing service limits upstream work separately. Request timeout is 300 seconds; fetch jobs run
in the background and the browser polls every 1.5 seconds, rather than holding one request open.

```bash
export PROJECT=YOUR_PROJECT_ID REGION=us-central1
export REPO=sima SERVICE=sima-demo
export BUCKET=YOUR_GLOBALLY_UNIQUE_CACHE_BUCKET
export IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/sima:judging-v1"
export SA="sima-demo@$PROJECT.iam.gserviceaccount.com"

gcloud auth login
gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com storage.googleapis.com
gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"
gcloud iam service-accounts create sima-demo
gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA" --role=roles/storage.objectUser
gcloud builds submit --tag "$IMAGE" .
gcloud run deploy "$SERVICE" --image="$IMAGE" --region="$REGION" \
  --service-account="$SA" --execution-environment=gen2 --allow-unauthenticated \
  --port=8080 --cpu=2 --memory=4Gi --concurrency=40 --timeout=300 \
  --min-instances=1 --max-instances=1 --no-cpu-throttling \
  --set-env-vars=SIMA_CACHE=/cache \
  --add-volume="name=cache,type=cloud-storage,bucket=$BUCKET,mount-options=uid=10001;gid=10001" \
  --add-volume-mount=volume=cache,mount-path=/cache \
  --startup-probe=httpGet.path=/api/health,httpGet.port=8080,initialDelaySeconds=5,periodSeconds=5,failureThreshold=12 \
  --liveness-probe=httpGet.path=/api/health,httpGet.port=8080,periodSeconds=30,failureThreshold=3
export URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
curl --fail "$URL/api/health"
```

Skip create commands for resources already set up. Cloud Build's build service account needs
Artifact Registry write permission; organisation policies may require an admin to grant it. The
person deploying needs permission to act as the runtime service account. Public judging access also
requires the organisation to allow unauthenticated Cloud Run invocation.

The bucket is private; the runtime account alone gets object access. UID/GID mount options let the
non-root container write. Cloud Storage FUSE is an object-store mount with different semantics from
a local disk: test a complete live fetch, a restart and cache reuse before judging. It is not a
shared job queue or a lock service. Without the mount, `/cache` is temporary and lost on replacement.
Cloud Run can restart even a minimum instance; a warm setting does not guarantee uninterrupted jobs.

References: [Cloud Storage mounts](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts),
[CPU allocation](https://docs.cloud.google.com/run/docs/configuring/cpu-allocation),
[health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks).

## Azure Container Apps

Use one replica, 2 CPU and 4 GiB, external ingress on port 8080 and an Azure Files share for the cache.
Azure's HTTP ingress timeout is 240 seconds. The app returns status promptly, so jobs may take longer
without requiring a longer HTTP request. Keep min and max replicas at 1 for the same job-state reason
as Cloud Run. Readiness and liveness use `/api/health`.

These commands use a managed identity to pull from private Azure Container Registry. The Azure Files
key is passed to the environment storage setting, not put in a tracked file. Do not run with shell
tracing (`set -x`). Storage names must be globally unique, lowercase letters and digits.

```bash
az login
az account set --subscription YOUR_SUBSCRIPTION_ID
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait
export RG=sima-demo LOCATION=eastus ENV=sima-demo APP=sima-demo
export ACR=YOURUNIQUEACRNAME STORAGE=YOURUNIQUESTORAGENAME SHARE=sima-cache
az group create --name "$RG" --location "$LOCATION"
az acr create --resource-group "$RG" --name "$ACR" --sku Basic
az acr build --registry "$ACR" --image sima:judging-v1 .
az identity create --resource-group "$RG" --name sima-pull
export IDENTITY=$(az identity show -g "$RG" -n sima-pull --query id -o tsv)
export PRINCIPAL=$(az identity show -g "$RG" -n sima-pull --query principalId -o tsv)
export ACR_ID=$(az acr show -g "$RG" -n "$ACR" --query id -o tsv)
az role assignment create --assignee-object-id "$PRINCIPAL" \
  --assignee-principal-type ServicePrincipal --role AcrPull --scope "$ACR_ID"
az containerapp env create --name "$ENV" --resource-group "$RG" --location "$LOCATION"
az storage account create --name "$STORAGE" --resource-group "$RG" \
  --location "$LOCATION" --sku Standard_LRS --kind StorageV2
export STORAGE_KEY=$(az storage account keys list -g "$RG" -n "$STORAGE" --query '[0].value' -o tsv)
az storage share create --name "$SHARE" --account-name "$STORAGE" --account-key "$STORAGE_KEY" --quota 20
az containerapp env storage set --name "$ENV" --resource-group "$RG" \
  --storage-name cache --storage-type AzureFile --azure-file-account-name "$STORAGE" \
  --azure-file-account-key "$STORAGE_KEY" --azure-file-share-name "$SHARE" --access-mode ReadWrite
unset STORAGE_KEY
export ENV_ID=$(az containerapp env show -g "$RG" -n "$ENV" --query id -o tsv)
export REGISTRY=$(az acr show -g "$RG" -n "$ACR" --query loginServer -o tsv)
# Render the template into an untracked temporary file. Requires Python 3.
export APP_YAML=$(mktemp)
python3 - <<'PY'
import os
from pathlib import Path
text = Path('docs/azure-containerapp.yaml').read_text()
for key in ('APP', 'LOCATION', 'ENV_ID', 'IDENTITY', 'REGISTRY'):
    text = text.replace('${' + key + '}', os.environ[key])
Path(os.environ['APP_YAML']).write_text(text)
PY
az containerapp create --resource-group "$RG" --yaml "$APP_YAML"
rm "$APP_YAML"
export URL="https://$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)"
curl --fail "$URL/api/health"
```

Allow time for the AcrPull role to propagate if the first image pull fails, then retry. Azure Files
uses SMB; the template sets UID/GID and modes so user 10001 can write. Check that cache files appear
in the share, then restart the revision and confirm reuse. Without this mount, the cache is temporary.

References: [Azure Files mounts](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts),
[ingress limits](https://learn.microsoft.com/en-us/azure/container-apps/ingress),
[managed identity image pulls](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull).

## Static-only hosting

All five shipped targets work without Python. Other spots use the app's labelled simulation and say
live fetching is off. Build with an explicitly empty variable, even if your shell enables it:

```bash
npm ci
VITE_LIVE_API='' npm run build
```

**Firebase Hosting (recommended static option, HTTPS included):** select or create a Firebase project
in your own account, then run the commands below. `firebase.json` is included; it hosts only `dist/`
and sets cache headers. It does not rewrite `/api` to a backend.

```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

**Cloud Storage:** create a separate public bucket, never make the live cache bucket public.

```bash
export STATIC_BUCKET=YOUR_GLOBALLY_UNIQUE_STATIC_BUCKET
gcloud storage buckets create "gs://$STATIC_BUCKET" --location=us-central1 --uniform-bucket-level-access
gcloud storage buckets update "gs://$STATIC_BUCKET" --web-main-page-suffix=index.html --web-error-page=404.html
gcloud storage rsync --recursive dist/ "gs://$STATIC_BUCKET"
gcloud storage objects update "gs://$STATIC_BUCKET/**" --cache-control=no-cache
gcloud storage objects update "gs://$STATIC_BUCKET/assets/**" --cache-control='public,max-age=31536000,immutable'
# Ensure binary frames are not transparently decompressed by the host.
gcloud storage objects update "gs://$STATIC_BUCKET/data/*/frames.bin.gz" \
  --content-type=application/octet-stream --clear-content-encoding
gcloud storage buckets add-iam-policy-binding "gs://$STATIC_BUCKET" --member=allUsers --role=roles/storage.objectViewer
```

The build uses root-relative asset paths, so a `storage.googleapis.com/BUCKET/index.html` link
will not serve the whole app correctly. Put this bucket behind an HTTPS load balancer with a backend
bucket and your domain, following the linked guide, or use Firebase for a simpler judging URL.
A bucket website with a matching DNS domain supports HTTP only. Public access prevention policies
may forbid making this bucket public.
[Cloud Storage static website guide](https://docs.cloud.google.com/storage/docs/hosting-static-website).

**Azure Static Web Apps:** build as above, create the static app, then deploy the built directory.
Keep the deployment token out of logs and unset it afterwards.

```bash
az staticwebapp create --name sima-static --resource-group "$RG" --location eastus2 --sku Free
export SWA_CLI_DEPLOYMENT_TOKEN=$(az staticwebapp secrets list --name sima-static \
  --resource-group "$RG" --query properties.apiKey -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --env production
unset SWA_CLI_DEPLOYMENT_TOKEN
az staticwebapp show --name sima-static --resource-group "$RG" --query defaultHostname -o tsv
```

Do not upload the live-enabled container build here. Static hosts may choose their own cache and
compression settings; verify `frames.bin.gz` downloads decode and the five targets work after upload.
[Static Web Apps CLI](https://learn.microsoft.com/en-us/azure/static-web-apps/static-web-apps-cli).

## Costs and demo day

Credits are a payment method, not a spending limit. One warm instance and always-allocated Cloud Run
CPU cost money while idle. Storage, requests, outbound bytes, image registry and builds can also
cost money. Azure Files and its storage account remain billable when the app is stopped. Set budget
alerts in the chosen account. Keep max instances at 1 to limit compute and pressure on NASA. After
the event, remove unneeded services and storage or set min instances to 0; keep Cloud Run CPU always
allocated while live jobs need to run. Review the provider's current prices before running this.

Before judging:

1. Deploy once, wait for health, and open the public HTTPS URL in a fresh browser.
2. Test Barnard's Star, Epsilon Indi B, WISE 0855−0714, RW Aurigae and R Draconis. Check real frames,
   dates, wavelengths, playback and Measure. No failed shipped-data requests should appear.
3. Warm up a live spot: RA 217.429, Dec −62.680, field 12′. Wait for the first look and full set.
   NASA can be busy; a local health response alone is not proof a live fetch works.
4. Refresh and open that spot again. Confirm cached data returns, and inspect logs for errors.
5. Before the event (not during it), restart once and confirm the persistent cache is reused.
   Then warm up again. Keep the five shipped targets as the dependable demo path.
6. Check credits, billing alerts, public access, and the video/screenshots saved for the submission.

A seed export bucket is a later add-on. The other lane is preparing a seed script and a configurable
static base URL. Keep the export bucket separate from the private working cache. Publish only its
intended static export with the required CORS/cache metadata; do not point the app at arbitrary cache
files. This deployment does not assume that unfinished contract or require it for judging.
