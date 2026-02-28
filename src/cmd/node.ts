import { execFile } from 'child_process';
import { initChainIfNeeded } from '../node/init-chain';
import { installCKBBinary } from '../node/install';
import { getCKBBinaryPath, readSettings } from '../cfg/setting';
import { createRPCProxy } from '../tools/rpc-proxy';
import { Network } from '../type/base';
import { logger } from '../util/logger';

export interface NodeProp {
  version?: string;
  network?: Network;
  binaryPath?: string;
}

export function startNode({ version, network = Network.devnet, binaryPath }: NodeProp) {
  if (binaryPath && network !== Network.devnet) {
    logger.warn('Custom binaryPath is only supported for devnet. The provided binaryPath will be ignored.');
  }

  switch (network) {
    case Network.devnet:
      return nodeDevnet({ version, binaryPath });
    case Network.testnet:
      return nodeTestnet();
    case Network.mainnet:
      return nodeMainnet();
    default:
      break;
  }
}

export async function nodeDevnet({ version, binaryPath }: NodeProp) {
  const settings = readSettings();
  const ckbVersion = version || settings.bins.defaultCKBVersion;
  let ckbBinRawPath = '';

  if (binaryPath) {
    ckbBinRawPath = binaryPath;
    logger.info(`Using custom CKB binary path: ${ckbBinRawPath}`);
  } else {
    await installCKBBinary(ckbVersion);
    ckbBinRawPath = getCKBBinaryPath(ckbVersion);
  }
  await initChainIfNeeded();
  const devnetConfigRawPath = settings.devnet.configPath;

  logger.info(`Launching CKB devnet Node...`);
  try {
    // Run first command
    const ckbProcess = execFile(ckbBinRawPath, ['run', '-C', devnetConfigRawPath]);
    // Log first command's output
    ckbProcess.stdout?.on('data', (data) => {
      logger.info(['CKB:', data.toString()]);
    });

    ckbProcess.stderr?.on('data', (data) => {
      logger.error(['CKB error:', data.toString()]);
    });

    // Start the second command after 3 seconds
    setTimeout(async () => {
      try {
        // Run second command
        const minerProcess = execFile(ckbBinRawPath, ['miner', '-C', devnetConfigRawPath]);
        minerProcess.stdout?.on('data', (data) => {
          logger.info(['CKB-Miner:', data.toString()]);
        });
        minerProcess.stderr?.on('data', (data) => {
          logger.error(['CKB-Miner error:', data.toString()]);
        });

        // by default we start the proxy server
        const ckbRpc = settings.devnet.rpcUrl;
        const port = settings.devnet.rpcProxyPort;
        const proxy = createRPCProxy(Network.devnet, ckbRpc, port);
        proxy.start();
      } catch (error) {
        logger.error('Error running CKB-Miner:', error);
      }
    }, 3000);
  } catch (error) {
    logger.error('Error:', error);
  }
}

export async function nodeTestnet() {
  // todo: maybe we can actually start a node for testnet later
  // by default we start a proxy server for testnet
  const settings = readSettings();
  const ckbRpc = settings.testnet.rpcUrl;
  const port = settings.testnet.rpcProxyPort;
  const proxy = createRPCProxy(Network.testnet, ckbRpc, port);
  proxy.start();
}

export async function nodeMainnet() {
  // todo: maybe we can actually start a node for mainnet later
  // by default we start a proxy server for mainnet
  const settings = readSettings();
  const ckbRpc = settings.mainnet.rpcUrl;
  const port = settings.mainnet.rpcProxyPort;
  const proxy = createRPCProxy(Network.mainnet, ckbRpc, port);
  proxy.start();
}
