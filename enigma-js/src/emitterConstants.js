export const ERROR = 'error';
export const DEPOSIT_TRANSACTION_HASH = 'depositTransactionHash';
export const DEPOSIT_CONFIRMATION = 'depositConfirmation';
export const DEPOSIT_RECEIPT = 'depositReceipt';
export const WITHDRAW_TRANSACTION_HASH = 'withdrawTransactionHash';
export const WITHDRAW_CONFIRMATION = 'withdrawConfirmation';
export const WITHDRAW_RECEIPT = 'withdrawReceipt';
export const LOGIN_TRANSACTION_HASH = 'loginTransactionHash';
export const LOGIN_CONFIRMATION = 'loginConfirmation';
export const LOGIN_RECEIPT = 'loginReceipt';
export const LOGOUT_TRANSACTION_HASH = 'logoutTransactionHash';
export const LOGOUT_CONFIRMATION = 'logoutConfirmation';
export const LOGOUT_RECEIPT = 'logoutReceipt';

export const DEPLOY_SC_ADDR_RESULT = 'deploySCAddrResult';
export const DEPLOY_SC_ETH_TRANSACTION_HASH = 'deploySCEthTransactionHash';
export const DEPLOY_SC_ETH_CONFIRMATION = 'deploySCEthConfirmation';
export const DEPLOY_SC_ETH_RECEIPT = 'deploySCEthReceipt';
export const DEPLOY_SC_ENG_RECEIPT = 'deploySCEngReceipt';

export const CREATE_TASK = 'createTask';
export const CREATE_TASK_INPUT = 'createTaskInput';
export const CREATE_TASK_RECORD_TRANSACTION_HASH = 'createTaskRecordTransactionHash';
export const CREATE_TASK_RECORD_CONFIRMATION = 'createTaskRecordConfirmation';
export const CREATE_TASK_RECORD_RECEIPT = 'createTaskRecordReceipt';
export const CREATE_TASK_RECORD = 'createTaskRecord';

export const SEND_TASK_INPUT_RESULT = 'sendTaskInputResult';
export const POLL_TASK_STATUS_RESULT = 'pollTaskStatusResult';
export const GET_TASK_RESULT_RESULT = 'getTaskResultResult';
export const DEPLOY_SECRET_CONTRACT_RESULT = 'deploySecretContractResult';

export const RETURN_FEES_FOR_TASK_RECEIPT = 'returnFeesForTaskReceipt';
export const RETURN_FEES_FOR_TASK = 'returnFeesForTask';

export const POLL_TASK_ETH_RESULT = 'pollTaskETHResult';

export const RPC_SEND_TASK_INPUT = 'sendTaskInput';
export const RPC_DEPLOY_SECRET_CONTRACT = 'deploySecretContract';
export const RPC_GET_TASK_RESULT = 'getTaskResult';
export const RPC_GET_TASK_STATUS = 'getTaskStatus';
export const GET_TASK_RESULT_SUCCESS = 'SUCCESS';
export const GET_TASK_RESULT_FAILED = 'FAILED';
export const GET_TASK_RESULT_UNVERIFIED = 'UNVERIFIED';
export const GET_TASK_RESULT_INPROGRESS = 'INPROGRESS';

export const ETH_STATUS_UNDEFINED = 0;
export const ETH_STATUS_CREATED = 1;
export const ETH_STATUS_VERIFIED = 2;
export const ETH_STATUS_FAILED = 3;
export const ETH_STATUS_FAILED_ETH = 4;
export const ETH_STATUS_FAILED_RETURN = 5;
