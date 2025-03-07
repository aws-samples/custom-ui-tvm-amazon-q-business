import time      
import logging
import os
import boto3
import cfnresponse
from concurrent.futures import ThreadPoolExecutor, as_completed

qbusiness_client = boto3.client('qbusiness') 
logger = logging.getLogger(__name__)   

MAX_RETRIES=25
DELAY=25

def wait_for_all_data_sources(application_id, index_id, data_sources):          
  max_retries=MAX_RETRIES 
  delay=DELAY

  def wait_for_data_source(data_source_id):
    for attempt in range(max_retries):
        try:
            response = qbusiness_client.get_data_source(
                applicationId=application_id,
                indexId=index_id,
                dataSourceId=data_source_id
            )
            status = response['status']
            logger.info(f"Polling attempt {attempt + 1}: Data source {data_source_id} status is '{status}'")

            if status == "ACTIVE":
                logger.info(f"Data source {data_source_id} is now ACTIVE.")
                return data_source_id, "ACTIVE"
            elif status == "FAILED":
                logger.info(f"Data source {data_source_id} failed.")
                return data_source_id, "FAILED"
        except Exception as e:
            logger.error(f"An error occurred for data source {data_source_id}: {e}")
            raise e
        time.sleep(delay)
    logger.info(f"Data source {data_source_id} did not reach a terminal state within the timeout.")
    return data_source_id, "TIMEOUT"
  results = {}
  with ThreadPoolExecutor(max_workers=len(data_sources)) as executor:
      future_to_data_source = {executor.submit(wait_for_data_source, ds_id): ds_id for ds_id in data_sources}
      for future in as_completed(future_to_data_source):
          ds_id = future_to_data_source[future]
          try:
              ds_id, status = future.result()
              results[ds_id] = status
          except Exception as e:
              print(f"An error occurred while waiting for data source {ds_id}: {e}")
              results[ds_id] = "ERROR"
  return results


def wait_for_index_completion(application_id, index_id):          
  max_retries=MAX_RETRIES
  delay=DELAY
  for attempt in range(max_retries):
      try:
          index_waiter = qbusiness_client.get_index(applicationId=application_id, indexId=index_id)
          status = index_waiter['status']
          logger.info(f"Polling attempt {attempt + 1}: Current status of index {index_id} is '{status}'")
          if status == "ACTIVE":
              print(f"Index {index_id} is now ACTIVE.")
              return status
          elif status == "FAILED":
              print(f"Index {index_id} failed to reach ACTIVE status.")
              return status                
      except Exception as e:
          logger.error(f"An error occurred while checking index status: {e}")
          raise e
      time.sleep(delay)

  logger.info(f"Maximum retries reached. Index {index_id} did not reach a terminal state.")
  return "TIMEOUT"  

def lambda_handler(event, context):      
    application_name = os.environ.get('Q_BIZ_APP_NAME', 'my-test-q-business-app')
    iam_idp_provier_arn = os.environ.get('IAM_PROVIDER_ARN', '')
    iam_idp_client_ids = os.environ.get('IAM_PROVIDER_AUDIENCE', '')
    s3_bucket_name = os.environ.get('Q_BIZ_S3_SOURCE_BKT', '')
    s3_data_source_name = 'S3DataSource'
    webcrawler_data_source_name = 'WebCrawlerDataSource'
    webcrawler_seed_urls = os.environ.get('Q_BIZ_SEED_URL', '').split(",")
    ds_role_arn = os.environ.get('DATA_SOURCE_ROLE', '')

    response_data = {}
    logger.info(f"Creating Q Business application with name {application_name}, datasources bucket {s3_bucket_name} and URLS {webcrawler_seed_urls}")

    try:
        if event['RequestType'] == 'Create':
            # Create Amazon Q Business Application
            create_app_response = qbusiness_client.create_application(
                displayName=application_name,
                identityType= 'AWS_IAM_IDP_OIDC',
                iamIdentityProviderArn=iam_idp_provier_arn,
                clientIdsForOIDC=[iam_idp_client_ids],
                attachmentsConfiguration={
                    'attachmentsControlMode': 'DISABLED'
                },
                qAppsConfiguration={
                    'qAppsControlMode': 'DISABLED'
                }
            )
            application_id = create_app_response['applicationId']
            response_data['ApplicationId'] = application_id
            logger.info(f'Application created with ID: {application_id}')

            logger.info(f'Turning on creator mode for application : {application_id}')
            # This ensures auto subscription
            qbusiness_client.update_chat_controls_configuration(
                          applicationId=application_id,
                          creatorModeConfiguration={
                              'creatorModeControl': 'ENABLED'
                          }
                      )
            
            #create index
            response_index = qbusiness_client.create_index(
                    applicationId=application_id,
                    displayName='amzn-q-biz-index',
                    type='ENTERPRISE',
                    capacityConfiguration={
                        'units': 1
                    }
                )
            index_id = response_index['indexId']
            # Wait for index creation
            index_status = wait_for_index_completion(application_id, index_id)

            if index_status == "TIMEOUT" or index_status == "FAILED":
              raise Exception(f"Index creation failed with status : {index_status}")
            
            # Create Retriever
            retriever_response = qbusiness_client.create_retriever(
                                        applicationId=application_id,
                                        type='NATIVE_INDEX',
                                        displayName='q-business-native-inex-retriever',
                                        configuration={
                                            'nativeIndexConfiguration': {
                                                'indexId': index_id
                                            }
                                        }
                                  )
            logger.info(f"Successfully created retriever: {retriever_response['retrieverId']}")
            response_data['RetrieverId'] = retriever_response['retrieverId']

            # Create S3 Data Source
            s3_data_source_config = {
                "type": "S3",
                "syncMode": "FULL_CRAWL",
                "connectionConfiguration": {
                    "repositoryEndpointMetadata": {
                        "BucketName": s3_bucket_name
                    }
                },
                "repositoryConfigurations": {
                    "document": {
                        "fieldMappings": [
                          {
                            "indexFieldName": "created_at",
                            "indexFieldType": "DATE",
                            "dataSourceFieldName": "_created_at"
                          }
                        ]
                    }
                }
            }
            s3_data_source_response = qbusiness_client.create_data_source(
                applicationId=application_id,
                indexId=index_id,
                displayName=s3_data_source_name,
                configuration=s3_data_source_config,
                syncSchedule='',
                roleArn=ds_role_arn
            )
            s3_data_source_id = s3_data_source_response['dataSourceId']
            response_data['S3DataSourceId'] = s3_data_source_id
            logger.info(f'S3 data source created with ID: {s3_data_source_id}')

            # Create Web Crawler Data Source
            seedUrls = [{"seedUrl": i} for i in webcrawler_seed_urls]
            web_data_source_config = {
                  "type": "WEBCRAWLERV2",
                  "syncMode": "FULL_CRAWL",
                  "connectionConfiguration": {
                    "repositoryEndpointMetadata": {      
                      "seedUrlConnections": seedUrls,
                      "authentication": "NoAuthentication"
                    }
                  },
                  "repositoryConfigurations": {
                    "webPage": {
                      "fieldMappings": [
                        {
                          "indexFieldName": "title",
                          "indexFieldType": "STRING",
                          "dataSourceFieldName": "page_title",
                          "dateFieldFormat": "yyyy-MM-dd'T'HH:mm:ss'Z'"
                        }
                      ]
                    },
                    "attachment": {
                      "fieldMappings": [
                        {
                          "indexFieldName": "attachment_title",
                          "indexFieldType": "STRING",
                          "dataSourceFieldName": "attachment_name",
                          "dateFieldFormat": "yyyy-MM-dd'T'HH:mm:ss'Z'"
                        }
                      ]
                    }
                  },
                  "additionalProperties": {
                    "rateLimit": "300",
                    "maxFileSize": "50",
                    "crawlDepth": "1",
                    "maxLinksPerUrl": "1",
                    "crawlSubDomain": "true",
                    "crawlAllDomain": "true",
                    "honorRobots": "true"
                  }
                }
            webcrawler_data_source_response = qbusiness_client.create_data_source(
                applicationId=application_id,
                indexId=index_id,
                displayName=webcrawler_data_source_name,
                configuration=web_data_source_config,
                syncSchedule='',
                roleArn=ds_role_arn
            )
            webcrawler_data_source_id = webcrawler_data_source_response['dataSourceId']
            response_data['WebCrawlerDataSourceId'] = webcrawler_data_source_id
            logger.info(f'Web crawler data source created with ID: {webcrawler_data_source_id}')

            # Check for status of the data sources
            data_source_ids = [s3_data_source_id, webcrawler_data_source_id]
            final_statuses = wait_for_all_data_sources(application_id, index_id, data_source_ids)

            if all(status == "ACTIVE" for status in final_statuses.values()):
                logger.info("Both data sources are ACTIVE. Proceeding to start S3 and Webcrawler sync...")
                for ds_id in data_source_ids:
                    qbusiness_client.start_data_source_sync_job(
                        dataSourceId=ds_id,
                        applicationId=application_id,
                        indexId=index_id
                    )
                    logger.info(f"Started sync for: {ds_id}")
                logger.info("Both Sync's initiated. Done...")   

                logger.info(f'Turning on auto subscription for application : {application_id}')
                # Ensures auto subscription is turned on for OIDC users
                qbusiness_client.update_application(
                            applicationId=application_id,
                            autoSubscriptionConfiguration={
                                'autoSubscribe': 'ENABLED',
                                'defaultSubscriptionType': 'Q_BUSINESS'
                            }
                        )             
            else:
                raise Exception(f"One or more data sources failed or timed out: {final_statuses}")                
            
            cfnresponse.send(event, context, cfnresponse.SUCCESS, response_data, application_id)
            return {"message": "Successfully created", "data": response_data}
        elif event['RequestType'] == 'Delete':
            # Retrieve the ApplicationId from the event's PhysicalResourceId
            application_id = event.get('PhysicalResourceId')
            if application_id and application_id != 'FAILED':
                # Delete the Amazon Q Business Application
                qbusiness_client.delete_application(applicationId=application_id)
                logger.info(f'Application with ID {application_id} deleted.')
            cfnresponse.send(event, context, cfnresponse.SUCCESS, response_data)
            return {"message": "Successfully deleted"}
    except Exception as e:
        logger.error(f'An unexpected error occurred: {e}')
        cfnresponse.send(event, context, cfnresponse.FAILED, response_data)
