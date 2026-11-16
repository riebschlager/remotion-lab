import React, {createContext, useContext, useMemo} from 'react';

/** Keep legacy seeds for default instances; new identities get independent,
 * collision-resistant seeds that survive reordering and out-of-order frames.
 */
export const instanceSeed = (type: string, id: string, channel: string) =>
  id === type ? `${type}-${channel}` : JSON.stringify([type, id, channel]);

type InstanceState = {id: string; type: string; seed: (channel: string) => string};
const InstanceContext = createContext<InstanceState | null>(null);

export const LayerInstanceProvider: React.FC<{
  id: string; type: string; children: React.ReactNode;
}> = ({id, type, children}) => {
  const value = useMemo(() => ({id, type, seed: (channel: string) => instanceSeed(type, id, channel)}), [id, type]);
  return <InstanceContext.Provider value={value}>{children}</InstanceContext.Provider>;
};

export const useLayerInstance = () => {
  const instance = useContext(InstanceContext);
  if (!instance) throw new Error('useLayerInstance() must be used inside a registered layer instance');
  return instance;
};
