#!/usr/bin/env bash
# Create or update the AWS stack for the pm workers (recorder + linker) and the markets API (pm-api
# behind CloudFront).
#
#   deploy/aws/up.sh                 # default VPC, first public subnet, t4g.small, 10 GiB data volume
#   STACK=pm-workers AWS_REGION=eu-north-1 INSTANCE_TYPE=t4g.small DATA_GIB=10 deploy/aws/up.sh
#   SUBNET_ID=subnet-... deploy/aws/up.sh      # pick the subnet yourself
#
# Needs: aws CLI with credentials (aws sts get-caller-identity works). Safe to re-run: CloudFormation
# computes the diff. After the first run, run deploy/aws/push.sh to build, push and start the workers.
#
# The host's AMI parameter resolves the latest Amazon Linux 2023 image on every run, and a newer image
# than the running host's makes CloudFormation REPLACE the host. This script refuses that unless
# ALLOW_HOST_REPLACE=1 is set (the data volume is kept and re-attached either way).
set -euo pipefail
cd "$(dirname "$0")/../.."

STACK="${STACK:-pm-workers}"
export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-north-1}}"
export AWS_PROFILE="${AWS_PROFILE:-insurance-markets}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.small}"
DATA_GIB="${DATA_GIB:-10}"
AMI_PARAM=/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64

aws sts get-caller-identity --query Account --output text >/dev/null || { echo "no AWS credentials; see deploy/aws/README.md"; exit 1; }

if [ -z "${SUBNET_ID:-}" ]; then
  VPC_ID="$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)"
  [ "$VPC_ID" != None ] || { echo "no default VPC in $AWS_REGION; pass SUBNET_ID="; exit 1; }
  SUBNET_ID="$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" Name=map-public-ip-on-launch,Values=true \
    --query 'sort_by(Subnets,&AvailabilityZone)[0].SubnetId' --output text)"
fi
read -r VPC_ID AZ < <(aws ec2 describe-subnets --subnet-ids "$SUBNET_ID" --query 'Subnets[0].[VpcId,AvailabilityZone]' --output text)

# CloudFront's origin-facing addresses, as this region's AWS-managed prefix list: the API port is open to it only.
PREFIX_LIST_ID="$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)"
case "$PREFIX_LIST_ID" in pl-*) ;; *) echo "the CloudFront origin-facing prefix list was not found in $AWS_REGION"; exit 1 ;; esac

# An existing host keeps its image unless replacing it was asked for.
HOST_ID="$(aws cloudformation describe-stack-resource --stack-name "$STACK" --logical-resource-id Host \
  --query StackResourceDetail.PhysicalResourceId --output text 2>/dev/null || true)"
RUNNING_AMI=""
if [ -n "$HOST_ID" ] && [ "$HOST_ID" != None ]; then
  RUNNING_AMI="$(aws ec2 describe-instances --instance-ids "$HOST_ID" --query 'Reservations[0].Instances[0].ImageId' --output text)"
fi
LATEST_AMI="$(aws ssm get-parameter --name "$AMI_PARAM" --query Parameter.Value --output text)"
if [ -n "$RUNNING_AMI" ] && [ "$RUNNING_AMI" != "$LATEST_AMI" ] && [ -z "${ALLOW_HOST_REPLACE:-}" ]; then
  echo "The running host uses $RUNNING_AMI; the latest Amazon Linux 2023 image is $LATEST_AMI."
  echo "Deploying now would replace the host (minutes without the recorder; /data is kept and re-attached)."
  echo "Re-run with ALLOW_HOST_REPLACE=1 to accept that."
  exit 1
fi

echo "stack=$STACK region=$AWS_REGION vpc=$VPC_ID subnet=$SUBNET_ID az=$AZ type=$INSTANCE_TYPE data=${DATA_GIB}GiB cloudfront-prefix-list=$PREFIX_LIST_ID"

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file deploy/aws/stack.yaml \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides VpcId="$VPC_ID" SubnetId="$SUBNET_ID" AvailabilityZone="$AZ" InstanceType="$INSTANCE_TYPE" DataVolumeGiB="$DATA_GIB" \
    CloudFrontPrefixListId="$PREFIX_LIST_ID"

aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
