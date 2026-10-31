import { X } from 'lucide-react'
export default function Modal({ title, onClose, children, wide }) {
  return (<div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={'modal card' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
      <div className="modal-head"><h3>{title}</h3><button className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={18} /></button></div>
      {children}</div></div>)
}
