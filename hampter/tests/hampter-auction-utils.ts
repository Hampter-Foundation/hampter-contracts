import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  AuctionEnded,
  BidPlaced,
  FundsWithdrawn,
  OwnershipTransferred,
  RefundClaimed,
  WinnersAnnounced
} from "../generated/HampterAuction/HampterAuction"

export function createAuctionEndedEvent(): AuctionEnded {
  let auctionEndedEvent = changetype<AuctionEnded>(newMockEvent())

  auctionEndedEvent.parameters = new Array()

  return auctionEndedEvent
}

export function createBidPlacedEvent(
  bidder: Address,
  amount: BigInt
): BidPlaced {
  let bidPlacedEvent = changetype<BidPlaced>(newMockEvent())

  bidPlacedEvent.parameters = new Array()

  bidPlacedEvent.parameters.push(
    new ethereum.EventParam("bidder", ethereum.Value.fromAddress(bidder))
  )
  bidPlacedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return bidPlacedEvent
}

export function createFundsWithdrawnEvent(
  owner: Address,
  amount: BigInt
): FundsWithdrawn {
  let fundsWithdrawnEvent = changetype<FundsWithdrawn>(newMockEvent())

  fundsWithdrawnEvent.parameters = new Array()

  fundsWithdrawnEvent.parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner))
  )
  fundsWithdrawnEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return fundsWithdrawnEvent
}

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent = changetype<OwnershipTransferred>(
    newMockEvent()
  )

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createRefundClaimedEvent(
  bidder: Address,
  amount: BigInt
): RefundClaimed {
  let refundClaimedEvent = changetype<RefundClaimed>(newMockEvent())

  refundClaimedEvent.parameters = new Array()

  refundClaimedEvent.parameters.push(
    new ethereum.EventParam("bidder", ethereum.Value.fromAddress(bidder))
  )
  refundClaimedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return refundClaimedEvent
}

export function createWinnersAnnouncedEvent(
  winningBids: Array<BigInt>
): WinnersAnnounced {
  let winnersAnnouncedEvent = changetype<WinnersAnnounced>(newMockEvent())

  winnersAnnouncedEvent.parameters = new Array()

  winnersAnnouncedEvent.parameters.push(
    new ethereum.EventParam(
      "winningBids",
      ethereum.Value.fromUnsignedBigIntArray(winningBids)
    )
  )

  return winnersAnnouncedEvent
}
