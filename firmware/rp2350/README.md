# ZooLark RP2350 test firmware v0.4.0-test

This is the first real-hardware bring-up firmware for the ZooLark Web Instrument.

## Target

- Pico SDK 2.3.0
- `PICO_BOARD=pico2`
- Intended for RP2350-class hardware using a Pico/Pico 2 style GPIO assignment for the first test.
- The code does not rely on RP2350B-only extra GPIOs, so it is suitable for early bring-up on RP2350A/B boards provided the board's flash/clock/USB wiring is Pico-2 compatible.

## Test pin map

| Function | GPIO |
|---|---:|
| Logic D0..D7 | GPIO0..GPIO7 |
| JTAG TCK | GPIO10 |
| JTAG TMS | GPIO11 |
| JTAG TDI | GPIO12 |
| JTAG TDO | GPIO13 |
| Status LED | GPIO25 |

All logic analyzer inputs are 3.3 V GPIO inputs. **Do not connect 5 V logic directly.**

## Implemented now

- TinyUSB vendor Bulk IN/OUT transport
- WFL2 framing + CRC32
- `PING`
- `GET_DEVICE_INFO`
- `ENTER_BOOTLOADER`
- 8-channel PIO + DMA logic capture (up to 128 Ki samples in this test build)
- JTAG TAP reset and generic IDCODE chain scan

## Deliberately not implemented yet

- Logic trigger/pre-trigger engine: v0.4-test captures immediately after ARM. Trigger fields are accepted so the browser protocol remains stable.
- FPGA programming: target-family-specific configuration algorithms are not guessed. The command returns `BAD_COMMAND` until a target FPGA family is chosen.
- Oscilloscope/AWG/VNA/DC power hardware control: these require the actual ZooLark analog front-end schematic.
- Windows automatic WinUSB binding/MS OS 2.0 descriptor: first hardware test is optimized for macOS Chrome/Edge. This will be added after USB/WFL2 bring-up succeeds.

## Build locally

```bash
export PICO_SDK_PATH=/path/to/pico-sdk
cmake -S firmware/rp2350 -B build-rp2350 -DPICO_BOARD=pico2
cmake --build build-rp2350 -j
```

Output:

```text
build-rp2350/zoolark_rp2350.uf2
```

## Flash test

1. Hold BOOTSEL while connecting/resetting the RP2350 board.
2. Copy `zoolark-rp2350b-v0.4.0-test.uf2` to the RP2350 mass-storage boot drive.
3. The device reboots as `ZooLark RP2350 Web Instrument` with test VID/PID `CAFE:401F`.
4. Open the ZooLark Vercel preview in desktop Chrome/Edge.
5. Click `连接真机`, select the ZooLark device.
6. Verify the header shows firmware `0.4.0-test`.
7. Test logic capture by wiring GPIO0..7 to safe 3.3 V digital signals.
8. Test JTAG scan by wiring GPIO10..13 to a 3.3 V JTAG target and sharing GND.

## Safety

This first UF2 is a digital bring-up image. It does not drive analog power rails or programmable DC outputs.
