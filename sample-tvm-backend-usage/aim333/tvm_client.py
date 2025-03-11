# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import base64
import requests
import boto3

class TVMClient:
    def __init__(self, issuer: str, client_id: str, client_secret:str, role_arn: str, region: str = 'us-east-1'):
        """
        Initialize the token client
        
        Args:
            issuer: The token issuer URL
            role_arn: The ARN of the role to assume
            region: AWS region (default: us-east-1)
        """
        self.issuer = issuer
        self.role_arn = role_arn
        self.region = region
        self.client_id = client_id
        self.client_secret = client_secret

    def _fetch_id_token(self, email: str) -> str:
        """
        Fetch ID token from the issuer
        
        Args:
            email: Email address for token request
            
        Returns:
            str: The ID token
            
        Raises:
            requests.RequestException: If the token fetch fails
        """
        # Create basic auth header
        auth_string = f"{self.client_id}:{self.client_secret}"
        auth_bytes = auth_string.encode('utf-8')
        auth = base64.b64encode(auth_bytes).decode('utf-8')
        
        response = requests.post(
            f"{self.issuer}/token",
            headers={
                'Authorization': f'Basic {auth}',
                'Content-Type': 'application/json'
            },
            json={'email': email}
        )
        
        response.raise_for_status()  # Raise exception for non-200 status codes
        return response.json()['id_token']

    def get_sigv4_credentials(self, email: str) -> boto3.client:
        """
        Get an AWS client using the ID token for role assumption
        
        Args:
            email: Email for token request
            service_name: AWS service to create client for (e.g., 's3', 'dynamodb')
            
        Returns:
            boto3.client: Initialized AWS client with assumed role credentials
        """
        # Get the ID token
        id_token = self._fetch_id_token(email)
        
        # Create STS client
        sts = boto3.client('sts', region_name=self.region)
        
        # Assume role with web identity
        response = sts.assume_role_with_web_identity(
            RoleArn=self.role_arn,
            RoleSessionName=f"session-{email}",
            WebIdentityToken=id_token
        )
        
        # Extract credentials from response
        credentials = response['Credentials']
        
        # Return sigv4 credentials
        return {
            "aws_access_key_id": credentials['AccessKeyId'],
            "aws_secret_access_key": credentials['SecretAccessKey'],
            "aws_session_token" : credentials['SessionToken']
        }