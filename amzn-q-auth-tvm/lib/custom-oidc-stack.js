const cdk = require('aws-cdk-lib');
const { Stack, Duration } = cdk;
const lambda = require('aws-cdk-lib/aws-lambda');
const apigateway = require('aws-cdk-lib/aws-apigateway');
const ssm = require('aws-cdk-lib/aws-ssm');
const iam = require('aws-cdk-lib/aws-iam');
const custom_resources = require('aws-cdk-lib/custom-resources');
const allowListedDomains = require("../allow-list-domains.json");
const { randomBytes } = require('crypto');
require('dotenv').config()

class TVMOidcIssuerStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const region = this.region;
    const accountId = this.account;
    const keyId = `${region}-kid`;
    const secretID = randomBytes(12).toString('hex');

    // Generate a deterministic Audience for the OIDC issuer
    const audience = `${this.region}-${this.account}-tvm`;

    //Create allow-listed domains parameters in SSM
    new ssm.StringParameter(this, 'OIDCAllowListParameter', {
      parameterName: '/oidc/allow-list',
      stringValue: allowListedDomains.allowList.join(','),
      description: 'The Allow listed domains for TVM OIDC Provider'
    });

    //Client ID
    new ssm.StringParameter(this, 'OIDCClientId', {
      parameterName: '/oidc/client_id',
      stringValue: `oidc-tvm-${this.account}`,
      description: 'The Client ID for TVM provider'
    });

    //Client Secret
    new ssm.StringParameter(this, 'OIDCClientSecret', {
      parameterName: '/oidc/client_secret',
      stringValue: secretID,
      description: 'The Client ID for TVM provider'
    });

    // IAM Role for Key Generation Lambda
    const keyGenLambdaRole = new iam.Role(this, 'KeyGenLambdaRole', {
      roleName: 'tvm-key-gen-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    keyGenLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:PutParameter', 'ssm:DeleteParameter', "ssm:DeleteParameters"],
      resources: [`arn:aws:ssm:${region}:${accountId}:parameter/oidc/private_key`,
                  `arn:aws:ssm:${region}:${accountId}:parameter/oidc/public_key`,
                  `arn:aws:ssm:${region}:${accountId}:parameter/oidc/client_id`,
                  `arn:aws:ssm:${region}:${accountId}:parameter/oidc/client_secret`]
    }));

    // IAM Role for OIDC Lambda
    const oidcLambdaRole = new iam.Role(this, 'OidcLambdaRole', {
      roleName: 'tvm-oidc-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    oidcLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${region}:${accountId}:parameter/oidc/private_key`,
        `arn:aws:ssm:${region}:${accountId}:parameter/oidc/public_key`,
        `arn:aws:ssm:${region}:${accountId}:parameter/oidc/client_id`,
        `arn:aws:ssm:${region}:${accountId}:parameter/oidc/client_secret`,
        `arn:aws:ssm:${region}:${accountId}:parameter/oidc/allow-list`,
      ]
    }));

    // Lambda to generate RSA key pair and store in SSM
    const keyGenLambda = new lambda.DockerImageFunction(this, 'KeyGenLambda', {
      functionName: 'tvm-key-gen-lambda',
      code: lambda.DockerImageCode.fromImageAsset('lambdas/key-gen'),
      handler: 'app.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: Duration.seconds(300),
      role: keyGenLambdaRole
    });

    const keyGenProvider = new custom_resources.Provider(this, 'KeyGenProvider', {
      onEventHandler: keyGenLambda,
    });

    new cdk.CustomResource(this, 'KeyGenCustomResource', {
      serviceToken: keyGenProvider.serviceToken,
    });

    // Lambda Authorizer function for API Gateway
    const authorizerLambda = new lambda.Function(this, 'OIDCLambdaAuthorizerFn', {
      functionName: 'tvm-oidc-lambda-authorizer',
      code: lambda.Code.fromAsset('lambdas/lambda-authorizer'),
      handler: 'app.lambda_handler',
      environment: {        
        CLIENT_ID_PARAM: '/oidc/client_id',
        CLIENT_SECRET_PARAM: '/oidc/client_secret',
        OIDC_ALLOW_LIST: '/oidc/allow-list'
      },
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: Duration.seconds(300),
      role: oidcLambdaRole
    });

    // Create the API Gateway (API URL not needed here)
    const api = new apigateway.RestApi(this, 'OidcApi', {
        restApiName: 'OIDC Issuer Service',
        description: 'Handles OIDC issuance and verification.',
        defaultCorsPreflightOptions: {
          allowOrigins: apigateway.Cors.ALL_ORIGINS,
          allowMethods: apigateway.Cors.ALL_METHODS,
          allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
          exposeHeaders: ['Access-Control-Allow-Origin',
                          'Access-Control-Allow-Credentials',],
          statusCode: 200,
          allowCredentials: false
        },
        deployOptions:{
            loggingLevel: apigateway.MethodLoggingLevel.INFO,
            dataTraceEnabled: true,            
        },
        cloudWatchRole: true,      
    });

    const oidcLambda = new lambda.DockerImageFunction(this, 'OidcLambda', {
      functionName: 'tvm-oidc-lambda',
      code: lambda.DockerImageCode.fromImageAsset('lambdas/oidc-issuer'),
      environment: {
        PRIVATE_KEY_PARAM: '/oidc/private_key',
        PUBLIC_KEY_PARAM: '/oidc/public_key',
        KID: keyId,
        REGION: region,
        AUDIENCE: audience,
      },
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: Duration.seconds(300),
      role: oidcLambdaRole
    });

    // Set up API Gateway routes (without issuer URL yet)
    // Create the Lambda Authorizer
    const authorizer = new apigateway.RequestAuthorizer(this, 'OIDCLambdaAuthorizer', {
      handler: authorizerLambda,
      identitySources: [apigateway.IdentitySource.header('Authorization')],
    });

    const tokenResource = api.root.addResource('token');
    tokenResource.addMethod('POST', new apigateway.LambdaIntegration(oidcLambda), {
        authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const wellknown = api.root.addResource('.well-known');
    const openidResource = wellknown.addResource('openid-configuration');
    openidResource.addMethod('GET', new apigateway.LambdaIntegration(oidcLambda));

    const jwksResource = wellknown.addResource('jwks.json');
    jwksResource.addMethod('GET', new apigateway.LambdaIntegration(oidcLambda));

    const issuerDomain = `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`;
    const stage = api.deploymentStage.stageName;
    
    // Create an OIDC IAM Identity Provider
    const oidcIAMProvider = new iam.OpenIdConnectProvider(this, 'OIDCIAMProvider', {
      url: `https://${issuerDomain}/${stage}`,
      clientIds: [audience]
    });

    // Create the IAM Role to Assume
    const audienceCondition = new cdk.CfnJson(this, 'AudienceCondition', {
      value: {
        [`${issuerDomain}/${stage}:aud`]: audience
      }
    });

    const qbizIAMRole = new iam.Role(this, 'QBusinessOIDCRole', {
      roleName: 'tvm-qbiz-custom-oidc-role',
      description: 'Role for TVM OIDC-based authentication in Amazon Q Business.',
      assumedBy: new iam.CompositePrincipal(
        // First statement for AssumeRoleWithWebIdentity
        new iam.FederatedPrincipal(
          oidcIAMProvider.openIdConnectProviderArn,
          {
            StringEquals: audienceCondition,
            StringLike: {
              'aws:RequestTag/Email': '*'
            }
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
        // Second statement for TagSession
        new iam.FederatedPrincipal(
          oidcIAMProvider.openIdConnectProviderArn,
          {
            StringLike: {
              'aws:RequestTag/Email': '*'
            }
          },
          'sts:TagSession'
        ),
        // Q Business service trust
        new iam.ServicePrincipal('application.qbusiness.amazonaws.com')
          .withConditions({
            StringEquals: {
              'aws:SourceAccount': this.account
            },
            ArnEquals: {
              'aws:SourceArn': `arn:aws:qbusiness:${this.region}:${this.account}:application/*`
            }
          })
      )
    });


    // Add inline policy for permissions
    qbizIAMRole.attachInlinePolicy(new iam.Policy(this, 'QBusinessPermissions', {
      statements: [
        new iam.PolicyStatement({
          sid: 'QBusinessConversationPermission',
          effect: iam.Effect.ALLOW,
          actions: [
            'qbusiness:Chat',
            'qbusiness:ChatSync',
            'qbusiness:Retrieve',
            'qbusiness:SearchRelevantContent',
            'qbusiness:ListApplications',
            'qbusiness:ListRetrievers',
            'qbusiness:ListMessages',
            'qbusiness:ListConversations',
            'qbusiness:PutFeedback',
            'qbusiness:DeleteConversation'
          ],
          resources: [`arn:aws:qbusiness:${this.region}:${this.account}:application/*`]
        }),
        new iam.PolicyStatement({
          sid: 'QBusinessSetContextPermissions',
          effect: iam.Effect.ALLOW,
          actions: ['sts:SetContext'],
          resources: ['arn:aws:sts::*:self'],
          conditions: {
            StringLike: {
              'aws:CalledViaLast': ['qbusiness.amazonaws.com']
            }
          }
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['user-subscriptions:CreateClaim'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:CalledViaLast': "qbusiness.amazonaws.com"
            }
          }
        })
      ]
    }));

    /**
     * Deploy if set to 'true'
     */
    if(props.deployQbiz){
      // Creates a role for the data sources
      const dataSourceRole = new iam.Role(this, 'QBusinessDataSourceRole', {
        roleName: 'tvm-qbiz-data-source-role',
        description: 'Role required for Amazon Q Business data sources.',
        assumedBy: new iam.ServicePrincipal('qbusiness.amazonaws.com')
        .withConditions({
          StringEquals: {
            'aws:SourceAccount': this.account
          },
          ArnEquals: {
            'aws:SourceArn': `arn:aws:qbusiness:${this.region}:${this.account}:application/*`
          }
        })
      });

      dataSourceRole.attachInlinePolicy(new iam.Policy(this, 'QBizDataSourcePermissions',{
        statements: [
          new iam.PolicyStatement({
            sid: 'AllowsAmazonQToGetObjectfromS3',
            effect: iam.Effect.ALLOW,
            actions: [
              's3:GetObject'
            ],
            resources: [`arn:aws:s3:::${process.env.Q_BIZ_S3_SOURCE_BKT}/*`],
            conditions: {
              StringEquals: {
                'aws:ResourceAccount': this.account
              }
            }
          }),
          new iam.PolicyStatement({
            sid: 'AllowsAmazonQToListS3Buckets',
            effect: iam.Effect.ALLOW,
            actions: ['s3:ListBucket'],
            resources: [`arn:aws:s3:::${process.env.Q_BIZ_S3_SOURCE_BKT}`],
            conditions: {
              StringEquals: {
                'aws:ResourceAccount': this.account
              }
            }
          }),
          new iam.PolicyStatement({
            sid: 'AllowsAmazonQToIngestDocuments',
            effect: iam.Effect.ALLOW,
            actions: ['qbusiness:BatchPutDocument', 'qbusiness:BatchDeleteDocument'],
            resources: ['*']
          }),
          new iam.PolicyStatement({
            sid: 'AllowsAmazonQToCallPrincipalMappingAPIs',
            effect: iam.Effect.ALLOW,
            actions: [
              'qbusiness:PutGroup',
              'qbusiness:CreateUser',
              'qbusiness:DeleteGroup',
              'qbusiness:UpdateUser',
              'qbusiness:ListGroups'
            ],
            resources: ['*']
          })
        ]
      }));

      //Creates a role for the external resource lambda that creates the Q Business Application
      const qBizLambdaRole = new iam.Role(this, 'QBizLambdaRole', {
        roleName: 'tvm-q-biz-lambda-role',
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
        ]
      });

      qBizLambdaRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'qbusiness:CreateApplication', 
          'qbusiness:UpdateApplication', 
          'qbusiness:CreateIndex', 
          'qbusiness:CreateRetriever',
          'qbusiness:CreateDataSource',
          'qbusiness:StartDataSourceSyncJob',
          'qbusiness:GetIndex',
          'qbusiness:GetDataSource',
          'qbusiness:DeleteApplication',
          "qbusiness:GetChatControlsConfiguration",
          "qbusiness:UpdateChatControlsConfiguration",
          ],
        resources: ["*"]
      }));

      qBizLambdaRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'iam:PassRole'
          ],
        resources: [dataSourceRole.roleArn]
      }));

      qBizLambdaRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'iam:CreateServiceLinkedRole'
          ],
        resources: ["*"]
      }));

      const qBizCreationLambda = new lambda.DockerImageFunction(this, 'QBizCreationLambda', {
        functionName: 'tvm-q-biz-creation-lambda',
        code: lambda.DockerImageCode.fromImageAsset('lambdas/q-biz'),
        handler: 'app.lambda_handler',
        runtime: lambda.Runtime.PYTHON_3_10,
        timeout: Duration.minutes(15),
        role: qBizLambdaRole,
        environment: {
          DATA_SOURCE_ROLE: dataSourceRole.roleArn,
          Q_BIZ_APP_NAME: process.env.Q_BIZ_APP_NAME,
          IAM_PROVIDER_ARN: oidcIAMProvider.openIdConnectProviderArn,
          IAM_PROVIDER_AUDIENCE: audience,
          Q_BIZ_S3_SOURCE_BKT: process.env.Q_BIZ_S3_SOURCE_BKT,
          Q_BIZ_SEED_URL: process.env.Q_BIZ_SEED_URLS
        }
      });

      const qBizAppProvider = new custom_resources.Provider(this, 'QBizAppProvider', {
        onEventHandler: qBizCreationLambda,
      });
  
      new cdk.CustomResource(this, 'QBizAppCustomResource', {
        serviceToken: qBizAppProvider.serviceToken,
      });

    }

    // Output Audience Id
    new cdk.CfnOutput(this, 'AudienceOutput', {
      description: 'OIDC Audience ID',
      value: audience,
      exportName: 'OIDCAudience',
    });

    // Output API URL
    new cdk.CfnOutput(this, 'IssuerUrlOutput', {
      description: 'Issuer URL (API Gateway)',
      value: api.url,
      exportName: 'IssuerUrl',
    });

    // Output Q Business Role to Assume q-biz-custom-oidc-assume-role
    new cdk.CfnOutput(this, 'QBizAssumeRoleARN', {
      description: 'Amazon Q Business Role to Assume',
      value: qbizIAMRole.roleArn,
      exportName: 'AssumeRoleARN',
    });

    // Output Client ID
    new cdk.CfnOutput(this, 'QbizTVMClientID', {
      description: 'The TVM Client ID',
      value: `oidc-tvm-${this.account}`,
      exportName: 'TVMClientID',
    });

    // Output Client secret
    new cdk.CfnOutput(this, 'QbizTVMClientSecret', {
      description: 'The TVM Client Secret',
      value: secretID,
      exportName: 'TVMClientSecret',
    });
  }
}

module.exports = { TVMOidcIssuerStack };
