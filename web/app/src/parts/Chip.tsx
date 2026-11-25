// 고른 것 하나. 누르면 빠진다
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';

export const Chip = ({ name, onRemove }: { name: string; onRemove: () => void }) => (
  <Button size="lg" label={`${name} 빼기`} endContent={<Icon icon="close" size="sm" />} onClick={onRemove}>{name}</Button>
);
