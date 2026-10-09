import {GdbRemote} from '../gdb/gdbremote';
import {MemoryModelAmstradPCW} from './pcwmemorymodels';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegisterAmaliaDecoder} from './z80registersamaliadecoder';


/** The Amstrad PCW running the Amalia gdbstub.
 * Only the standard gdb packets are used, see GdbRemote.
 * The stub appends the 4 memory slots to the 'g' packet reply.
 */
export class AmaliaGdbRemote extends GdbRemote {
	protected override logName = 'AmaliaGdbRemote';


	/** The decoder also reads the memory slots.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegisterAmaliaDecoder();
	}


	/** The PCW pages 4 banks of 16k.
	 */
	protected createMemoryModel() {
		return new MemoryModelAmstradPCW();
	}


	protected override async afterXmlParsed(): Promise<void> {
		await this.sendPacketData('?');
	}


	/** Resolves Amalia's initial '?' query, whose T reply is otherwise treated as a stop notification.
	 * Other packets are handled by the shared GDB implementation.
	 */
	protected override receivedMsg(packetData?: string): void {
		if (packetData?.startsWith('T')) {
			const msg = this.messageQueue[0];
			if (msg?.customData.packetData === '?') {
				this.stopCmdRespTimeout();
				this.messageQueue.shift();
				void (async () => {
					await this.sendNextMessage();
					msg.resolve(packetData);
				})();
				return;
			}
		}
		super.receivedMsg(packetData);
	}


	/** The breakpoint address for the 'Z0'/'z0' packet.
	 * If the breakpoint is bound to a bank the full long address is sent
	 * (bank+1 in bits 16+), otherwise the plain 64k address. The Amalia
	 * gdbstub breaks on a long address only if that bank is paged in.
	 * @param longAddress The (long) breakpoint address.
	 */
	protected breakpointAddress(longAddress: number): string {
		const bankp1 = longAddress >>> 16;
		if (bankp1 === 0)
			return (longAddress & 0xFFFF).toString(16);	// Any bank
		return longAddress.toString(16);
	}


	/** Adds a breakpoint, bank aware.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		await this.sendPacketDataOk('Z0,' + this.breakpointAddress(bp.longAddress) + ',0');
		bp.bpId = 1;	// Removal is by address, so any non-zero id will do.
	}


	/** Removes a breakpoint, bank aware.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		await this.sendPacketDataOk('z0,' + this.breakpointAddress(bp.longAddress) + ',0');
	}
}
