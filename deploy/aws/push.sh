#!/usr/bin/env bash
# Build both images for linux/arm64 from the repository root, push them to ECR tagged :latest and
# :<git sha>, then run pm-deploy on the host through SSM (pulls, restarts the recorder if its image
# changed, enables the linker timer).
#
#   deploy/aws/push.sh              # both
#   deploy/aws/push.sh recorder     # one of them
#   NO_DEPLOY=1 deploy/aws/push.sh  # push only
set -euo pipefail
cd "$(dirname "$0")/../.."

STACK="${STACK:-pm-workers}"
export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-north-1}}"
export AWS_PROFILE="${AWS_PROFILE:-insurance-markets}"
WHICH="${1:-both}"
SHA="$(git rev-parse --short=12 HEAD)"

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
RECORDER_URI="$(out RecorderRepositoryUri)"
LINKER_URI="$(out LinkerRepositoryUri)"
INSTANCE_ID="$(out InstanceId)"
REGISTRY="${RECORDER_URI%%/*}"

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

build() { # name uri
  echo "== build $1 ($SHA) -> $2"
  docker buildx build --platform linux/arm64 --provenance=false -f "deploy/$1/Dockerfile" -t "$2:latest" -t "$2:$SHA" --push .
}
case "$WHICH" in
  both) build recorder "$RECORDER_URI"; build linker "$LINKER_URI" ;;
  recorder) build recorder "$RECORDER_URI" ;;
  linker) build linker "$LINKER_URI" ;;
  *) echo "usage: push.sh [both|recorder|linker]"; exit 2 ;;
esac

[ -n "${NO_DEPLOY:-}" ] && exit 0
echo "== pm-deploy on $INSTANCE_ID"
CMD_ID="$(aws ssm send-command --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript \
  --comment "pm-deploy $SHA" --parameters 'commands=["/usr/local/bin/pm-deploy"]' --query Command.CommandId --output text)"
for _ in $(seq 1 60); do
  STATUS="$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --query Status --output text 2>/dev/null || echo Pending)"
  case "$STATUS" in Pending|InProgress|Delayed) sleep 5 ;; *) break ;; esac
done
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
[ "$STATUS" = Success ]
