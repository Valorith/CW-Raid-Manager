import {
  MARKET_PRICE_WIZARD_TRADER_FILE_HANDLE_STORE,
  deleteStoredHandle,
  listStoredHandles,
  saveStoredHandle
} from './fileSystemHandleStorage';

type MarketPriceWizardTraderFileHandle = FileSystemFileHandle;

function buildTraderFileHandleKey(userId: string, fileName: string) {
  return `${userId}::${fileName}`;
}

export async function saveMarketPriceWizardTraderFileHandle(
  userId: string,
  handle: MarketPriceWizardTraderFileHandle
) {
  await saveStoredHandle(
    MARKET_PRICE_WIZARD_TRADER_FILE_HANDLE_STORE,
    buildTraderFileHandleKey(userId, handle.name),
    handle
  );
}

export async function listMarketPriceWizardTraderFileHandles(userId: string) {
  const storedHandles = await listStoredHandles<MarketPriceWizardTraderFileHandle>(
    MARKET_PRICE_WIZARD_TRADER_FILE_HANDLE_STORE
  );
  const keyPrefix = `${userId}::`;

  return storedHandles
    .filter((entry) => entry.key.startsWith(keyPrefix))
    .map((entry) => ({
      fileName: entry.key.slice(keyPrefix.length),
      handle: entry.handle
    }));
}

export async function deleteMarketPriceWizardTraderFileHandle(userId: string, fileName: string) {
  await deleteStoredHandle(
    MARKET_PRICE_WIZARD_TRADER_FILE_HANDLE_STORE,
    buildTraderFileHandleKey(userId, fileName)
  );
}
