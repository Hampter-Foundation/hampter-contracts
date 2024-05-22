Your test suite for the `HampterNFT` contract is already quite comprehensive, covering deployment, dev minting, allowlist minting, and public sale minting. However, there are a few additional tests you might consider to ensure full coverage of the contract's functionality, including edge cases and security checks.

Here are some suggestions for additional tests:

### Deployment

1. **Check Initialization of Variables**:
   Ensure that all important variables are correctly initialized.

```javascript
it("Should initialize collectionSize, maxBatchSize, and amountForDevs correctly", async function () {
  expect(await hampterNFT.collectionSize()).to.equal(100000);
  expect(await hampterNFT.maxPerAddressDuringMint()).to.equal(5);
  expect(await hampterNFT.amountForDevs()).to.equal(500);
});
```

### Dev Minting

2. **Edge Case for Zero Quantity**:
   Ensure that attempting to mint zero tokens is handled properly.

```javascript
it("Should fail if trying to mint zero quantity", async function () {
  await expect(hampterNFT.devMint(0)).to.be.revertedWith(
    "Quantity must be greater than zero"
  );
});
```

### Allowlist Minting

3. **Check Total Supply After Minting**:
   Verify that the total supply is updated correctly after minting.

```javascript
it("Should update total supply correctly after allowlist minting", async function () {
  await hampterNFT
    .connect(addr1)
    .allowlistMint({ value: ethers.parseEther("0.1") });
  expect(await hampterNFT.totalSupply()).to.equal(1);
});
```

4. **Exceed Allowlist Allocation**:
   Ensure that attempting to mint more than the allowlist allocation is handled correctly.

```javascript
it("Should fail if trying to mint more than allowlist allocation", async function () {
  await expect(
    hampterNFT.connect(addr1).allowlistMint({ value: ethers.parseEther("0.2") })
  ).to.be.revertedWith("not eligible for allowlist mint");
});
```

### Public Sale Minting

5. **Max Minting Per Address**:
   Check that the contract enforces the maximum number of mints per address.

```javascript
it("Should enforce max minting per address during public sale", async function () {
  await hampterNFT
    .connect(addr1)
    .publicSaleMint(5, { value: ethers.parseEther("1") });
  await expect(
    hampterNFT
      .connect(addr1)
      .publicSaleMint(1, { value: ethers.parseEther("0.2") })
  ).to.be.revertedWith("Exceeded max mint per address");
});
```

### Ownership and Access Control

6. **Ownership Transfer**:
   Test that ownership can be transferred and only the new owner can perform restricted actions.

```javascript
it("Should transfer ownership", async function () {
  await hampterNFT.transferOwnership(addr1.address);
  expect(await hampterNFT.owner()).to.equal(addr1.address);

  await expect(hampterNFT.devMint(10)).to.be.revertedWith(
    "Ownable: caller is not the owner"
  );
  await hampterNFT.connect(addr1).devMint(10);
  expect(await hampterNFT.balanceOf(addr1.address)).to.equal(10);
});
```

### General Functionality

7. **Pausing Contract**:
   Ensure that the contract can be paused and no minting can occur during the pause.

```javascript
it("Should allow owner to pause and unpause the contract", async function () {
  await hampterNFT.pause();
  await expect(
    hampterNFT
      .connect(addr1)
      .publicSaleMint(1, { value: ethers.parseEther("0.2") })
  ).to.be.revertedWith("Pausable: paused");

  await hampterNFT.unpause();
  await hampterNFT
    .connect(addr1)
    .publicSaleMint(1, { value: ethers.parseEther("0.2") });
  expect(await hampterNFT.balanceOf(addr1.address)).to.equal(1);
});
```

8. **Withdraw Funds**:
   Verify that only the owner can withdraw funds from the contract.

```javascript
it("Should allow only the owner to withdraw funds", async function () {
  await hampterNFT
    .connect(addr1)
    .publicSaleMint(1, { value: ethers.parseEther("0.2") });

  const initialBalance = await ethers.provider.getBalance(owner.address);
  await expect(hampterNFT.connect(addr1).withdraw()).to.be.revertedWith(
    "Ownable: caller is not the owner"
  );

  await hampterNFT.withdraw();
  const finalBalance = await ethers.provider.getBalance(owner.address);
  expect(finalBalance).to.be.gt(initialBalance);
});
```

### Edge Cases

9. **Minting Beyond Collection Size**:
   Ensure that minting does not exceed the total collection size.

```javascript
it("Should fail if minting exceeds collection size", async function () {
  await hampterNFT.setSaleInfo(
    ethers.parseEther
```
