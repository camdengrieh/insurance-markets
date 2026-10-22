#!/usr/bin/env bash
# Create or update the AWS stack for the pm workers (recorder + linker).
#
#   deploy/aws/up.sh                 # default VPC, first public subnet, t4g.small, 10 GiB data volume
#   STACK=pm-workers AWS_REGION=eu-north-1 INSTANCE_TYPE=t4g.small DATA_GIB=10 deploy/aws/up.sh
#   SUBNET_ID=subnet-... deploy/aws/up.sh      # pick the subnet yourself
#
# Needs: aws CLI with credentials (aws sts get-caller-identity works). Safe to re-run: CloudFormation
# computes the diff. After the first run, run deploy/aws/push.sh to build, push and start the workers.
set -euo pipefail
cd "$(dirname "$0")/../.."

STACK="${STACK:-pm-workers}"
export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-north-1}}"
export AWS_PROFILE="${AWS_PROFILE:-insurance-markets}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.small}"
DATA_GIB="${DATA_GIB:-10}"

aws sts get-caller-identity --query Account --output text >/dev/null || { echo "no AWS credentials; see deploy/aws/README.md"; exit 1; }

if [ -z "${SUBNET_ID:-}" ]; then
  VPC_ID="$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)"
  [ "$VPC_ID" != None ] || { echo "no default VPC in $AWS_REGION; pass SUBNET_ID="; exit 1; }
  SUBNET_ID="$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" Name=map-public-ip-on-launch,Values=true \
    --query 'sort_by(Subnets,&AvailabilityZone)[0].SubnetId' --output text)"
fi
read -r VPC_ID AZ < <(aws ec2 describe-subnets --subnet-ids "$SUBNET_ID" --query 'Subnets[0].[VpcId,AvailabilityZone]' --output text)
echo "stack=$STACK region=$AWS_REGION vpc=$VPC_ID subnet=$SUBNET_ID az=$AZ type=$INSTANCE_TYPE data=${DATA_GIB}GiB"

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file deploy/aws/stack.yaml \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides VpcId="$VPC_ID" SubnetId="$SUBNET_ID" AvailabilityZone="$AZ" InstanceType="$INSTANCE_TYPE" DataVolumeGiB="$DATA_GIB"

aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
