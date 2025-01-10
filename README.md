# Amazon Q Business Token Vending Machine and QUI

> [!IMPORTANT] 
> This solution requires using Amazon Q Business with [IAM Identity Provider](https://docs.aws.amazon.com/amazonq/latest/qbusiness-ug/create-application-iam.html) or Amazon Q Business in Anonymous mode, and does not support IAM Identity Center (IDC) based authentication setup. For calling Amazon Q Business APIs while using IDC, check [this GitHub repository](https://github.com/aws-samples/custom-web-experience-with-amazon-q-business).

> [!TIP]
> 💡 We highly recommend starting with [the wiki](https://github.com/aws-samples/custom-ui-tvm-amazon-q-business/wiki) before deploying.

Deploy a fully customizable Amazon Q Business AI Assistant experience

### Deploy TVM (Token Vending Machine) for Amazon Q Business

1. Clone this repo and `cd` into `/amzn-q-auth-tvm` directory
2. Run `npm install --save` and create a `.env` file.
3. Enter the following in the `.env` file with the account details of where you want to deploy the stack

```
CDK_DEFAULT_ACCOUNT=<account_id>
CDK_DEFAULT_REGION=<region>
```

4. (Optional) If you intend to use TVM with Amazon Q Business custom UI (QUI) then edit the `amzn-q-auth-tvm/allow-list-domains.json` file to add your domain to the allow list.
5. `cdk bootstrap`
6. `cdk synth`
7. `cdk deploy --require-approval never --outputs-file ./cdk-outputs.json --profile <profile>`
8. Once the stack is deployed note the following values from the stack's output

```
Outputs:
MyOidcIssuerStack.AudienceOutput = xxxxxxx
MyOidcIssuerStack.IssuerUrlOutput = https://xxxxxxx.execute-api.<region>.amazonaws.com/prod/
MyOidcIssuerStack.QBizAssumeRoleARN = arn:aws:iam::XXXXXXXX:role/q-biz-custom-oidc-assume-role

✨  Total time: 64.31s
```

8. The stack will create the TVM (Audience and Issuer endpoints), an IAM Role to assume with Q Business permissions, an IAM Identity Provider already setup with the Issuer and Audience (You should be able to see this Identity Provider from IAM Console)
9. Setup a Q Business App, Select "AWS IAM Identity Provider" (**Note**: Uncheck "Web Experience" from "Outcome" when creating the Q Business App), select "OpenID Connect (OIDC)" provider type for authentication and select the above created Identity Provider from the drop down, in "Client ID" enter the Audience value from the stack output above `AudienceOutput` (also found in `cdk-outputs.json` file that captures the output of stack deployment, or in your Cloudformation stack deployment output).
10. Setup your Q Business App following the rest of the steps by adding data sources etc.

### Call the API

If you want to call the Amazon Q Business API, you need to first retrieve a token which is then used to assume a role before making API calls. We've included a Python script that handles this authentication flow - you just need to provide the following parameters:

| Parameter     | Description                                                                |
|---------------|----------------------------------------------------------------------------|
| client_id     | fetch from `/oidc/client_id` in Systems manager parameter store.           |
| client_secret | fetch from `/oidc/client_secret` in Systems manager parameter store.       |
| issuer_url    | Fetch output parameter `IssuerUrlOutput` from the Cloudformation stack.    |
| email         | Any email you want.                                                        |
| role_arn      | Fetch output parameter  `QBizAssumeRoleARN` from the Cloudformation stack. |
| region        | AWS Region                                                                 |

```python
import requests
import boto3

# set the following env vars
client_id=""
client_secret=""
issuer_url=""
email=""
role_arn=""
region=""

def get_id_token():
    auth_string = f"{client_id}:{client_secret}"
    auth_bytes = auth_string.encode('utf-8')
    auth = base64.b64encode(auth_bytes).decode('utf-8')
        
    response = requests.post(
            f"{issuer_url}/token",
            headers={
                'Authorization': f'Basic {auth}',
                'Content-Type': 'application/json'
            },
            json={'email': email}
        )
        
    return response.json()['id_token']


sts = boto3.client('sts')
id_token = get_id_token()       # from previous step

# Assume role with web identity
response = sts.assume_role_with_web_identity(
            RoleArn=role_arn,
            RoleSessionName=f"session-{email}",
            WebIdentityToken=id_token
        )
        
# Extract credentials from response
credentials = response['Credentials']

qbiz_client = boto3.client(
            'qbusiness',
            region_name=region,
            aws_access_key_id=credentials['AccessKeyId'],
            aws_secret_access_key=credentials['SecretAccessKey'],
            aws_session_token=credentials['SessionToken']
        )

# Then start making Amazon Q Business API calls
chat_params = {
    "applicationId": "xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx",          # Amazon Q Business Application ID
    "userMessage": "Can you give me an overview of what Caas is?" # The user's query
}
response = qbiz_client.chat_sync(**chat_params)
print(response)
```

### Delete the TVM stack

To delete the TVM stack-

1. Change into the TVM stack root directory

```bash
cd amzn-q-auth-tvm
```

2. Run

```bash
cdk destroy
```

### Deploy sample React App with Custom Amazon Q UI usage

1. Change directory to `amzn-q-custom-ui`.
2. Run `npm install --save` to install dependencies.
3. Create a `.env` file at the root of the directory with these values. 
4. Note: the email should ideally be acquired by your user authentication mechanism.

```
VITE_QBIZ_APP_ID=<q-biz-app-id>
VITE_IAM_ROLE_ARN=<iam-role-arn-from-stack-deployment>
VITE_EMAIL=<email address>
VITE_AWS_REGION=<region-where-q-biz-app>
VITE_ISSUER=<issuer-url-from-stack>
```

> NOTE: For production you will need a similar file called `.env.production`

4. Run `npm run dev`
5. Visit your app in `localhost` URL provided by Vite local server

