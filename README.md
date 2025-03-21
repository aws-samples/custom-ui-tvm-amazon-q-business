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

